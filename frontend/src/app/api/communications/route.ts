import { NextRequest } from "next/server";
import type { Filter, Document } from "mongodb";
import { requireUser } from "@/lib/auth";
import { assertClaimExists } from "@/lib/claims";
import { logActivity } from "@/lib/activity";
import { handleError, ok } from "@/lib/http";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";
import { num, oneOf, readJson, str } from "@/lib/validate";

export const COMMUNICATION_TYPES = ["Email", "Phone", "SMS", "Letter", "In Person", "Portal"] as const;

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const params = request.nextUrl.searchParams;
    const filter: Filter<Document> = {};
    const claimId = Number(params.get("claim_id"));
    if (Number.isInteger(claimId) && claimId > 0) filter.claim_id = claimId;
    const type = params.get("communication_type");
    if (type && (COMMUNICATION_TYPES as readonly string[]).includes(type)) filter.communication_type = type;
    const search = params.get("search")?.trim();
    if (search) filter.$text = { $search: search.slice(0, 100) };

    const records = await (await getMongoDb()).collection(COLLECTIONS.communications)
      .find(filter).sort({ timestamp: -1 }).limit(500).toArray();
    return ok({ communications: records, communicationTypes: COMMUNICATION_TYPES });
  } catch (error) {
    return handleError(error, "retrieve communications");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "communication:write");
    const body = await readJson(request);
    const claimId = num(body, "claim_id", { required: true, integer: true, min: 1 })!;
    await assertClaimExists(claimId);
    const communicationType = oneOf(body, "communication_type", COMMUNICATION_TYPES, { required: true })!;
    const subject = str(body, "subject", { required: true, max: 200 })!;
    const message = str(body, "message", { required: true, max: 4000 })!;
    const sender = str(body, "sender", { max: 100 }) ?? user.full_name;
    const timestamp = new Date();
    const result = await (await getMongoDb()).collection(COLLECTIONS.communications).insertOne({
      claim_id: claimId, communication_type: communicationType, subject, message, sender, timestamp,
      created_by: { user_id: user.user_id, name: user.full_name }, created_at: timestamp, updated_at: timestamp,
    });
    await logActivity(user, { claim_id: claimId, action: "COMMUNICATION_RECORDED", entity: "claim_communications", entity_id: result.insertedId.toString(), details: { communication_type: communicationType, subject } });
    return ok({ _id: result.insertedId }, 201);
  } catch (error) {
    return handleError(error, "record communication");
  }
}
