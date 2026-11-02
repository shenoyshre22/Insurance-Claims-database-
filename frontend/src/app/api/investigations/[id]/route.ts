import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";
import { INVESTIGATION_RECOMMENDATIONS, RISK_LEVELS } from "@/lib/rules";
import { INVESTIGATION_STATUSES, listField } from "@/lib/investigation";
import { num, oneOf, readJson, str } from "@/lib/validate";
import { objectId } from "@/lib/objectid";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

/** Updates an investigation; new findings are appended ($push) so history is preserved. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "investigation:write");
    const _id = objectId((await params).id);
    const body = await readJson(request);
    const set: Record<string, unknown> = { updated_at: new Date() };
    const status = oneOf(body, "status", INVESTIGATION_STATUSES);
    const risk = oneOf(body, "risk_level", RISK_LEVELS);
    const score = num(body, "risk_score", { min: 0, max: 100, integer: true });
    const recommendation = oneOf(body, "recommendation", INVESTIGATION_RECOMMENDATIONS);
    const summary = str(body, "summary", { max: 2000 });
    if (status) set.status = status;
    if (risk) set.risk_level = risk;
    if (score != null) set.risk_score = score;
    if (recommendation) set.recommendation = recommendation;
    if (summary) set.summary = summary;
    if (body.observations !== undefined) set.observations = listField(body, "observations");
    if (body.fraud_indicators !== undefined) set.fraud_indicators = listField(body, "fraud_indicators");
    if (body.tags !== undefined) set.tags = listField(body, "tags");
    const newFindings = listField(body, "new_findings").map((finding) => ({ finding, recorded_at: new Date(), recorded_by: user.full_name }));

    const db = await getMongoDb();
    const update: Record<string, unknown> = { $set: set };
    if (newFindings.length) update.$push = { findings: { $each: newFindings } };
    const before = await db.collection(COLLECTIONS.investigations).findOneAndUpdate({ _id }, update);
    if (!before) throw new ApiError(404, "Investigation not found.");
    await logActivity(user, {
      claim_id: before.claim_id,
      action: status && status !== before.status ? "INVESTIGATION_STATUS_CHANGED" : "INVESTIGATION_UPDATED",
      entity: "investigation_records",
      entity_id: _id.toString(),
      from_status: before.status,
      to_status: status ?? before.status,
      details: { new_findings: newFindings.length, risk_level: risk ?? before.risk_level },
    });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update investigation");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "investigation:delete");
    const _id = objectId((await params).id);
    const doc = await (await getMongoDb()).collection(COLLECTIONS.investigations).findOneAndDelete({ _id });
    if (!doc) throw new ApiError(404, "Investigation not found.");
    await logActivity(user, { claim_id: doc.claim_id, action: "INVESTIGATION_DELETED", entity: "investigation_records", entity_id: _id.toString() });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "delete investigation");
  }
}
