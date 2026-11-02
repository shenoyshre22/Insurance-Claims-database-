import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { insertRow } from "@/lib/schema";
import { SETTLEMENT_STATUSES, validateSettlement } from "@/lib/rules";
import { date, num, readJson, today } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (status && (SETTLEMENT_STATUSES as readonly string[]).includes(status)) {
      conditions.push("cs.settlement_status = ?");
      parameters.push(status);
    }
    if (search) {
      conditions.push("(CAST(cs.settlement_id AS CHAR) LIKE ? OR CAST(cs.claim_id AS CHAR) LIKE ? OR c.name LIKE ?)");
      parameters.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[settlements], [summary], [eligible]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT cs.*, c.name AS customer_name, cl.claimed_amount,
                COALESCE(paid.total_paid, 0) AS total_paid,
                cs.settlement_amount - COALESCE(paid.total_paid, 0) AS outstanding,
                COALESCE(paid.payment_count, 0) AS payment_count
         FROM CLAIM_SETTLEMENT cs
         JOIN CLAIM cl ON cs.claim_id = cl.claim_id
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         LEFT JOIN (
           SELECT settlement_id, SUM(payment_amount) AS total_paid, COUNT(*) AS payment_count
           FROM PAYMENT WHERE COALESCE(payment_status, 'Completed') <> 'Reversed' GROUP BY settlement_id
         ) paid ON paid.settlement_id = cs.settlement_id
         ${where}
         ORDER BY cs.settlement_id DESC`,
        parameters
      ),
      pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(settlement_amount), 0) AS amount,
                (SELECT COALESCE(SUM(payment_amount), 0) FROM PAYMENT WHERE COALESCE(payment_status, 'Completed') <> 'Reversed') AS paid
         FROM CLAIM_SETTLEMENT`
      ),
      // Claims ready to settle: latest assessment approves and no settlement exists yet.
      pool.query<RowDataPacket[]>(
        `SELECT cl.claim_id, c.name AS customer_name, cl.claimed_amount, ca.assessed_amount, ca.recommendation
         FROM CLAIM cl
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN CLAIM_ASSESSMENT ca ON ca.claim_id = cl.claim_id
         WHERE ca.assessment_id = (
                 SELECT ca2.assessment_id FROM CLAIM_ASSESSMENT ca2 WHERE ca2.claim_id = cl.claim_id
                 ORDER BY ca2.assessment_date DESC, ca2.assessment_id DESC LIMIT 1)
           AND ca.recommendation IN ('Approve', 'Partially Approve')
           AND cl.claim_status <> 'Rejected'
           AND NOT EXISTS (SELECT 1 FROM CLAIM_SETTLEMENT cs WHERE cs.claim_id = cl.claim_id)
         ORDER BY cl.claim_id`
      ),
    ]);

    return ok({
      settlements,
      total: Number(summary[0].total),
      totalAmount: Number(summary[0].amount),
      totalPaid: Number(summary[0].paid),
      eligibleClaims: eligible,
    });
  } catch (error) {
    return handleError(error, "retrieve settlements");
  }
}

/** Creates a settlement in a transaction with row locks so concurrent admins cannot settle the same claim. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "settlement:write");
    const body = await readJson(request);
    const claimId = num(body, "claim_id", { required: true, integer: true, min: 1 })!;
    const amount = num(body, "settlement_amount", { required: true, min: 0.01 })!;
    const settlementDate = date(body, "settlement_date") ?? today();

    const result = await withTransaction(async (connection) => {
      const [claims] = await connection.query<RowDataPacket[]>(
        "SELECT claim_status FROM CLAIM WHERE claim_id = ? FOR UPDATE",
        [claimId]
      );
      if (!claims[0]) throw new ApiError(400, "Selected claim does not exist.");
      const [existing] = await connection.query<RowDataPacket[]>(
        "SELECT settlement_id FROM CLAIM_SETTLEMENT WHERE claim_id = ? FOR UPDATE",
        [claimId]
      );
      const [latest] = await connection.query<RowDataPacket[]>(
        `SELECT assessed_amount, recommendation FROM CLAIM_ASSESSMENT WHERE claim_id = ?
         ORDER BY assessment_date DESC, assessment_id DESC LIMIT 1`,
        [claimId]
      );
      const problem = validateSettlement({
        claimStatus: claims[0].claim_status,
        hasExistingSettlement: existing.length > 0,
        latestRecommendation: latest[0]?.recommendation ?? null,
        assessedAmount: latest[0] ? Number(latest[0].assessed_amount) : null,
        settlementAmount: amount,
      });
      if (problem) throw new ApiError(400, problem);

      const settlementId = await insertRow(connection, "CLAIM_SETTLEMENT", "settlement_id", {
        claim_id: claimId,
        settlement_amount: amount,
        settlement_date: settlementDate,
        settlement_status: "Approved",
      });
      // The after_claim_settlement trigger marks the claim Settled; repeated here so the rule holds even if the trigger is absent.
      await connection.query("UPDATE CLAIM SET claim_status = 'Settled' WHERE claim_id = ?", [claimId]);
      return { settlementId, from: claims[0].claim_status as string };
    });

    await logActivity(user, { claim_id: claimId, action: "SETTLEMENT_CREATED", entity: "CLAIM_SETTLEMENT", entity_id: result.settlementId, from_status: result.from, to_status: "Settled", details: { settlement_amount: amount } });
    return ok({ settlement_id: result.settlementId }, 201);
  } catch (error) {
    return handleError(error, "create settlement");
  }
}
