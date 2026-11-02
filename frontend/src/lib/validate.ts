import { ApiError } from "./http";

type Body = Record<string, unknown>;

export async function readJson(request: Request): Promise<Body> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Body;
  } catch {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
}

export function str(body: Body, key: string, opts: { required?: boolean; max?: number } = {}): string | null {
  const raw = body[key];
  if (raw == null || raw === "") {
    if (opts.required) throw new ApiError(400, `${label(key)} is required.`);
    return null;
  }
  if (typeof raw !== "string" && typeof raw !== "number") throw new ApiError(400, `${label(key)} must be text.`);
  const value = String(raw).trim();
  if (opts.required && !value) throw new ApiError(400, `${label(key)} is required.`);
  if (value.length > (opts.max ?? 500)) throw new ApiError(400, `${label(key)} is too long.`);
  return value || null;
}

export function num(body: Body, key: string, opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {}): number | null {
  const raw = body[key];
  if (raw == null || raw === "") {
    if (opts.required) throw new ApiError(400, `${label(key)} is required.`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ApiError(400, `${label(key)} must be a number.`);
  if (opts.integer && !Number.isInteger(value)) throw new ApiError(400, `${label(key)} must be a whole number.`);
  if (opts.min != null && value < opts.min) throw new ApiError(400, `${label(key)} must be at least ${opts.min}.`);
  if (opts.max != null && value > opts.max) throw new ApiError(400, `${label(key)} must be at most ${opts.max}.`);
  return value;
}

export function date(body: Body, key: string, opts: { required?: boolean } = {}): string | null {
  const value = str(body, key, { required: opts.required, max: 10 });
  if (value == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new ApiError(400, `${label(key)} must be a valid date (YYYY-MM-DD).`);
  return value;
}

export function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[], opts: { required?: boolean } = {}): T | null {
  const value = str(body, key, { required: opts.required, max: 60 });
  if (value == null) return null;
  if (!allowed.includes(value as T)) throw new ApiError(400, `${label(key)} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}

export function idParam(raw: string | undefined | null, name = "id"): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new ApiError(400, `Invalid ${name}.`);
  return value;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function label(key: string) {
  const text = key.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
