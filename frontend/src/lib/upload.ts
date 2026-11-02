import { ApiError } from "./errors.ts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string[]; check: (b: Uint8Array) => boolean }[] = [
  { mime: "application/pdf", ext: ["pdf"], check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { mime: "image/png", ext: ["png"], check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: ["jpg", "jpeg"], check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: ["webp"], check: (b) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 },
];

/**
 * Validates an uploaded file by size, extension AND magic bytes (the browser-supplied
 * MIME type is not trusted). Returns the detected MIME type and a safe file name.
 */
export function validateUpload(name: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new ApiError(400, "The uploaded file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "Files must be 5 MB or smaller.");
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const match = SIGNATURES.find((s) => s.check(bytes));
  if (!match || !match.ext.includes(ext)) throw new ApiError(415, "Only PDF, PNG, JPEG and WEBP files are allowed.");
  const baseName = name.split(/[\\/]/).pop() ?? "";
  const safeName = baseName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120) || `evidence.${ext}`;
  return { mime: match.mime, safeName };
}
