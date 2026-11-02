import { NextRequest } from "next/server";
import { GridFSBucket, ObjectId } from "mongodb";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { COLLECTIONS, EVIDENCE_BUCKET, getMongoDb } from "@/lib/mongo";
import { EVIDENCE_STATUSES } from "@/lib/rules";
import { oneOf, readJson, str } from "@/lib/validate";
import { objectId } from "@/lib/objectid";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

/** Update verification status / description. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "evidence:write");
    const _id = objectId((await params).id);
    const body = await readJson(request);
    const status = oneOf(body, "verification_status", EVIDENCE_STATUSES);
    const notes = str(body, "notes", { max: 500 });
    const description = str(body, "description", { max: 1000 });
    const set: Record<string, unknown> = {};
    if (status) {
      set.verification_status = status;
      set.verification = { verified_by: { user_id: user.user_id, name: user.full_name }, verified_at: new Date(), notes };
    }
    if (description) set.description = description;
    if (Object.keys(set).length === 0) throw new ApiError(400, "Nothing to update.");

    const db = await getMongoDb();
    const before = await db.collection(COLLECTIONS.evidence).findOneAndUpdate({ _id }, { $set: set });
    if (!before) throw new ApiError(404, "Evidence not found.");
    await logActivity(user, { claim_id: before.claim_id, action: status ? "EVIDENCE_VERIFICATION_CHANGED" : "EVIDENCE_UPDATED", entity: "claim_evidence", entity_id: _id.toString(), from_status: before.verification_status, to_status: status ?? before.verification_status });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update evidence");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "evidence:delete");
    const _id = objectId((await params).id);
    const db = await getMongoDb();
    const doc = await db.collection(COLLECTIONS.evidence).findOneAndDelete({ _id });
    if (!doc) throw new ApiError(404, "Evidence not found.");
    if (doc.file?.file_id instanceof ObjectId) {
      await new GridFSBucket(db, { bucketName: EVIDENCE_BUCKET }).delete(doc.file.file_id).catch(() => undefined);
    }
    await logActivity(user, { claim_id: doc.claim_id, action: "EVIDENCE_DELETED", entity: "claim_evidence", entity_id: _id.toString() });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "delete evidence");
  }
}
