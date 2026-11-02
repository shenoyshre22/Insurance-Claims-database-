import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";

const one = (rows: RowDataPacket[]) => Number(rows[0]?.total ?? 0);

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const [
      [customers], [policies], [claims], [settlements], [money], [byStatus], [byMonth], [byType], [recent], [pendingPayments],
    ] = await Promise.all([
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CUSTOMER"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM INSURANCE_POLICY"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CLAIM"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CLAIM_SETTLEMENT"),
      pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT COALESCE(SUM(claimed_amount), 0) FROM CLAIM) AS claimed,
           (SELECT COALESCE(SUM(settlement_amount), 0) FROM CLAIM_SETTLEMENT) AS settled,
           (SELECT COALESCE(SUM(payment_amount), 0) FROM PAYMENT WHERE COALESCE(payment_status, 'Completed') <> 'Reversed') AS paid,
           (SELECT COUNT(*) FROM CLAIM WHERE claim_status IN ('Pending', 'Under Review')) AS open_claims`
      ),
      pool.query<RowDataPacket[]>("SELECT claim_status AS label, COUNT(*) AS value FROM CLAIM GROUP BY claim_status ORDER BY value DESC"),
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(claim_date, '%Y-%m') AS label, COUNT(*) AS value, SUM(claimed_amount) AS amount
         FROM CLAIM
         WHERE claim_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY DATE_FORMAT(claim_date, '%Y-%m')
         ORDER BY label`
      ),
      pool.query<RowDataPacket[]>(
        `SELECT pt.policy_name AS label, COUNT(cl.claim_id) AS claims, COALESCE(SUM(cl.claimed_amount), 0) AS value
         FROM POLICY_TYPE pt
         LEFT JOIN INSURANCE_POLICY p ON pt.policy_type_id = p.policy_type_id
         LEFT JOIN CLAIM cl ON p.policy_id = cl.policy_id
         GROUP BY pt.policy_type_id, pt.policy_name
         ORDER BY value DESC`
      ),
      pool.query<RowDataPacket[]>(
        `SELECT cl.claim_id, c.name AS customer_name, cl.claim_date, cl.claimed_amount, cl.claim_status, cl.claim_priority
         FROM CLAIM cl JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id JOIN CUSTOMER c ON p.customer_id = c.customer_id
         ORDER BY cl.claim_date DESC, cl.claim_id DESC LIMIT 6`
      ),
      pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM CLAIM_SETTLEMENT cs
         WHERE cs.settlement_amount > (SELECT COALESCE(SUM(payment_amount), 0) FROM PAYMENT pay WHERE pay.settlement_id = cs.settlement_id AND COALESCE(pay.payment_status, 'Completed') <> 'Reversed')
           AND (cs.settlement_status IS NULL OR cs.settlement_status <> 'Cancelled')`
      ),
    ]);

    let nosql: { evidencePending: number; openInvestigations: number; highRisk: number; activityToday: number } | null = null;
    try {
      const db = await getMongoDb();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [evidencePending, openInvestigations, highRisk, activityToday] = await Promise.all([
        db.collection(COLLECTIONS.evidence).countDocuments({ verification_status: "Pending" }),
        db.collection(COLLECTIONS.investigations).countDocuments({ status: { $ne: "Closed" } }),
        db.collection(COLLECTIONS.investigations).countDocuments({ status: { $ne: "Closed" }, risk_level: { $in: ["High", "Critical"] } }),
        db.collection(COLLECTIONS.activity).countDocuments({ timestamp: { $gte: startOfDay } }),
      ]);
      nosql = { evidencePending, openInvestigations, highRisk, activityToday };
    } catch {
      nosql = null;
    }

    const toNum = (rows: RowDataPacket[]) => rows.map((row) => ({ ...row, value: Number(row.value) }));
    return ok({
      customers: one(customers),
      policies: one(policies),
      claims: one(claims),
      settlements: one(settlements),
      totalClaimed: Number(money[0].claimed),
      totalSettled: Number(money[0].settled),
      totalPaid: Number(money[0].paid),
      openClaims: Number(money[0].open_claims),
      pendingPayments: one(pendingPayments),
      claimsByStatus: toNum(byStatus),
      claimsByMonth: toNum(byMonth),
      amountByPolicyType: toNum(byType),
      recentClaims: recent,
      nosql,
    });
  } catch (error) {
    return handleError(error, "fetch dashboard statistics");
  }
}
