import { NextRequest } from "next/server";
import type { Filter, Document } from "mongodb";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";
import { INVESTIGATION_RECOMMENDATIONS, RISK_LEVELS } from "@/lib/rules";
import { assertClaimExists } from "@/lib/claims";
import { num, oneOf, readJson, str } from "@/lib/validate";
import { logActivity } from "@/lib/activity";
import { INVESTIGATION_STATUSES, listField } from "@/lib/investigation";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const sp = request.nextUrl.searchParams;
    const filter: Filter<Document> = {};
    const claimId = Number(sp.get("claim_id"));
    if (Number.isInteger(claimId) && claimId > 0) filter.claim_id = claimId;
    const risk = sp.get("risk_level");
    if (risk && (RISK_LEVELS as readonly string[]).includes(risk)) filter.risk_level = risk;
    const status = sp.get("status");
    if (status && (INVESTIGATION_STATUSES as readonly string[]).includes(status)) filter.status = status;

    const db = await getMongoDb();
    const collection = db.collection(COLLECTIONS.investigations);
    const [records, byRisk, byRecommendation, highRisk] = await Promise.all([
      collection.find(filter).sort({ updated_at: -1 }).limit(500).toArray(),
      collection.aggregate([
        { $group: { _id: "$risk_level", count: { $sum: 1 }, avg_score: { $avg: "$risk_score" }, open: { $sum: { $cond: [{ $ne: ["$status", "Closed"] }, 1, 0] } } } },
        { $sort: { avg_score: -1 } },
      ]).toArray(),
      collection.aggregate([
        { $group: { _id: "$recommendation", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      // Highest-risk open claims, with number of findings recorded per claim.
      collection.aggregate([
        { $match: { status: { $ne: "Closed" }, risk_level: { $in: ["High", "Critical"] } } },
        { $project: { claim_id: 1, risk_level: 1, risk_score: 1, findings_count: { $size: { $ifNull: ["$findings", []] } } } },
        { $group: { _id: "$claim_id", max_score: { $max: "$risk_score" }, findings: { $sum: "$findings_count" }, investigations: { $sum: 1 } } },
        { $sort: { max_score: -1 } },
        { $limit: 10 },
      ]).toArray(),
    ]);

    // Enrich with relational facts from MySQL (claim amount/customer) instead of duplicating them in MongoDB.
    const ids = highRisk.map((row) => Number(row._id)).filter(Number.isInteger);
    let claimFacts: RowDataPacket[] = [];
    if (ids.length) {
      [claimFacts] = await pool.query<RowDataPacket[]>(
        `SELECT cl.claim_id, cl.claimed_amount, cl.claim_status, c.name AS customer_name
         FROM CLAIM cl JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id JOIN CUSTOMER c ON p.customer_id = c.customer_id
         WHERE cl.claim_id IN (?)`,
        [ids]
      );
    }
    const facts = new Map(claimFacts.map((row) => [Number(row.claim_id), row]));
    return ok({
      records,
      byRisk,
      byRecommendation,
      highRisk: highRisk.map((row) => ({ ...row, claim: facts.get(Number(row._id)) ?? null })),
    });
  } catch (error) {
    return handleError(error, "retrieve investigations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "investigation:write");
    const body = await readJson(request);
    const claimId = num(body, "claim_id", { required: true, integer: true, min: 1 })!;
    await assertClaimExists(claimId);
    const now = new Date();
    const document = {
      claim_id: claimId,
      investigator: str(body, "investigator", { max: 100 }) ?? user.full_name,
      status: oneOf(body, "status", INVESTIGATION_STATUSES) ?? "Open",
      risk_level: oneOf(body, "risk_level", RISK_LEVELS, { required: true })!,
      risk_score: num(body, "risk_score", { required: true, min: 0, max: 100, integer: true })!,
      summary: str(body, "summary", { required: true, max: 2000 })!,
      findings: listField(body, "findings").map((finding) => ({ finding, recorded_at: now, recorded_by: user.full_name })),
      observations: listField(body, "observations"),
      fraud_indicators: listField(body, "fraud_indicators"),
      tags: listField(body, "tags"),
      recommendation: oneOf(body, "recommendation", INVESTIGATION_RECOMMENDATIONS, { required: true })!,
      created_by: { user_id: user.user_id, name: user.full_name },
      created_at: now,
      updated_at: now,
    };
    if (document.findings.length === 0) throw new ApiError(400, "Record at least one finding.");
    const result = await (await getMongoDb()).collection(COLLECTIONS.investigations).insertOne(document);
    await logActivity(user, { claim_id: claimId, action: "INVESTIGATION_OPENED", entity: "investigation_records", entity_id: result.insertedId.toString(), details: { risk_level: document.risk_level, recommendation: document.recommendation } });
    return ok({ _id: result.insertedId }, 201);
  } catch (error) {
    return handleError(error, "create investigation");
  }
}
