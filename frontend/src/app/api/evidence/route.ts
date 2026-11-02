import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { GridFSBucket, type Filter, type Document } from "mongodb";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { COLLECTIONS, EVIDENCE_BUCKET, getMongoDb } from "@/lib/mongo";
import { EVIDENCE_STATUSES } from "@/lib/rules";
import { assertClaimExists } from "@/lib/claims";
import { validateUpload } from "@/lib/upload";
import { logActivity } from "@/lib/activity";

const EVIDENCE_TYPES = ["Photograph", "Police Report", "Medical Report", "Invoice", "Repair Estimate", "Witness Statement", "Other"];

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, "evidence:read");
    const sp = request.nextUrl.searchParams;
    const filter: Filter<Document> = {};
    const claimId = Number(sp.get("claim_id"));
    if (Number.isInteger(claimId) && claimId > 0) filter.claim_id = claimId;
    const status = sp.get("status");
    if (status && (EVIDENCE_STATUSES as readonly string[]).includes(status)) filter.verification_status = status;
    const search = sp.get("search")?.trim();
    if (search) filter.$text = { $search: search.slice(0, 100) };

    const db = await getMongoDb();
    const collection = db.collection(COLLECTIONS.evidence);
    const [evidence, summary] = await Promise.all([
      collection.find(filter).sort({ uploaded_at: -1 }).limit(500).toArray(),
      // Aggregation: counts by verification status and type, plus total stored bytes.
      collection.aggregate([
        {
          $facet: {
            byStatus: [{ $group: { _id: "$verification_status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
            byType: [{ $group: { _id: "$evidence_type", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
            totals: [{ $group: { _id: null, documents: { $sum: 1 }, bytes: { $sum: { $ifNull: ["$file.size", 0] } }, claims: { $addToSet: "$claim_id" } } },
                     { $project: { _id: 0, documents: 1, bytes: 1, claims: { $size: "$claims" } } }],
          },
        },
      ]).toArray(),
    ]);
    return ok({ evidence, summary: summary[0], evidenceTypes: EVIDENCE_TYPES });
  } catch (error) {
    return handleError(error, "retrieve evidence");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "evidence:submit");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart form upload.");
    }
    const claimId = Number(form.get("claim_id"));
    if (!Number.isInteger(claimId) || claimId <= 0) throw new ApiError(400, "Claim ID is required.");
    const evidenceType = String(form.get("evidence_type") ?? "");
    if (!EVIDENCE_TYPES.includes(evidenceType)) throw new ApiError(400, "Choose a valid evidence type.");
    const description = String(form.get("description") ?? "").trim();
    if (!description || description.length > 1000) throw new ApiError(400, "Description is required (max 1000 characters).");
    const tags = String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10).map((t) => t.slice(0, 30));
    const source = String(form.get("source") ?? "").trim().slice(0, 100) || null;
    const capturedAt = String(form.get("captured_at") ?? "");
    const captured = /^\d{4}-\d{2}-\d{2}$/.test(capturedAt) ? new Date(capturedAt) : null;
    await assertClaimExists(claimId);

    const db = await getMongoDb();
    let file: Document | null = null;
    const upload = form.get("file");
    if (upload && typeof upload !== "string" && upload.size > 0) {
      const bytes = new Uint8Array(await upload.arrayBuffer());
      const { mime, safeName } = validateUpload(upload.name, bytes);
      const bucket = new GridFSBucket(db, { bucketName: EVIDENCE_BUCKET });
      const stream = bucket.openUploadStream(safeName, { metadata: { claim_id: claimId, contentType: mime } });
      await new Promise<void>((resolve, reject) => {
        stream.once("finish", () => resolve());
        stream.once("error", reject);
        stream.end(Buffer.from(bytes));
      });
      file = {
        file_id: stream.id,
        original_name: safeName,
        mime_type: mime,
        size: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }

    const document = {
      claim_id: claimId,
      evidence_type: evidenceType,
      description,
      tags,
      file,
      metadata: { source, captured_at: captured },
      verification_status: "Pending",
      verification: null,
      uploaded_by: { user_id: user.user_id, name: user.full_name },
      uploaded_at: new Date(),
    };
    const result = await db.collection(COLLECTIONS.evidence).insertOne(document);
    await logActivity(user, { claim_id: claimId, action: "EVIDENCE_UPLOADED", entity: "claim_evidence", entity_id: result.insertedId.toString(), details: { evidence_type: evidenceType, has_file: Boolean(file) } });
    return ok({ _id: result.insertedId }, 201);
  } catch (error) {
    return handleError(error, "upload evidence");
  }
}
