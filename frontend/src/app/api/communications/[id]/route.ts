import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { ApiError, handleError, ok } from "@/lib/http";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";
import { objectId } from "@/lib/objectid";
import { COMMUNICATION_TYPES } from "../route";
import { oneOf, readJson, str } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "communication:write");
    const _id = objectId((await params).id);
    const body = await readJson(request);
    const set: Record<string, unknown> = { updated_at: new Date() };
    const communicationType = oneOf(body, "communication_type", COMMUNICATION_TYPES);
    const subject = str(body, "subject", { max: 200 });
    const message = str(body, "message", { max: 4000 });
    const sender = str(body, "sender", { max: 100 });
    if (communicationType) set.communication_type = communicationType;
    if (subject) set.subject = subject;
    if (message) set.message = message;
    if (sender) set.sender = sender;
    if (Object.keys(set).length === 1) throw new ApiError(400, "Nothing to update.");
    const before = await (await getMongoDb()).collection(COLLECTIONS.communications).findOneAndUpdate({ _id }, { $set: set });
    if (!before) throw new ApiError(404, "Communication not found.");
    await logActivity(user, { claim_id: before.claim_id, action: "COMMUNICATION_UPDATED", entity: "claim_communications", entity_id: _id.toString() });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update communication");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "communication:delete");
    const _id = objectId((await params).id);
    const record = await (await getMongoDb()).collection(COLLECTIONS.communications).findOneAndDelete({ _id });
    if (!record) throw new ApiError(404, "Communication not found.");
    await logActivity(user, { claim_id: record.claim_id, action: "COMMUNICATION_DELETED", entity: "claim_communications", entity_id: _id.toString() });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "delete communication");
  }
}
