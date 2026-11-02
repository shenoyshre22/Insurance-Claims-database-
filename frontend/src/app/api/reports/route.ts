import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";

/** Analytical queries from the original SQL script, exposed to the UI. */
const REPORTS: Record<string, { title: string; sql: string }> = {
  multiPolicyCustomers: {
    title: "Customers with multiple policies (GROUP BY + HAVING)",
    sql: `SELECT c.customer_id, c.name, COUNT(p.policy_id) AS number_of_policies, SUM(p.coverage_amount) AS total_coverage
          FROM CUSTOMER c JOIN INSURANCE_POLICY p ON c.customer_id = p.customer_id
          GROUP BY c.customer_id, c.name HAVING COUNT(p.policy_id) > 1 ORDER BY number_of_policies DESC`,
  },
  avgClaimByType: {
    title: "Average and total claim amount by policy type",
    sql: `SELECT pt.policy_name, COUNT(cl.claim_id) AS claims, ROUND(AVG(cl.claimed_amount), 2) AS average_claim_amount,
                 SUM(cl.claimed_amount) AS total_claimed_amount
          FROM POLICY_TYPE pt JOIN INSURANCE_POLICY p ON pt.policy_type_id = p.policy_type_id
          JOIN CLAIM cl ON p.policy_id = cl.policy_id
          GROUP BY pt.policy_type_id, pt.policy_name ORDER BY total_claimed_amount DESC`,
  },
  aboveAverageClaims: {
    title: "Claims above the average claim amount (subquery)",
    sql: `SELECT claim_id, policy_id, claimed_amount, claim_status FROM CLAIM
          WHERE claimed_amount > (SELECT AVG(claimed_amount) FROM CLAIM) ORDER BY claimed_amount DESC`,
  },
  claimedVsAssessed: {
    title: "Claimed vs assessed amount",
    sql: `SELECT cl.claim_id, cl.claimed_amount, ca.assessed_amount, (cl.claimed_amount - ca.assessed_amount) AS difference
          FROM CLAIM cl JOIN CLAIM_ASSESSMENT ca ON cl.claim_id = ca.claim_id ORDER BY difference DESC`,
  },
  settlementPercentage: {
    title: "Settlement percentage (stored function CalculateSettlementPercentage)",
    sql: `SELECT cs.claim_id, cl.claimed_amount, cs.settlement_amount, CalculateSettlementPercentage(cs.claim_id) AS settlement_percentage
          FROM CLAIM_SETTLEMENT cs JOIN CLAIM cl ON cl.claim_id = cs.claim_id ORDER BY settlement_percentage DESC`,
  },
  claimsWithoutSettlement: {
    title: "Claims without settlement (LEFT JOIN … IS NULL)",
    sql: `SELECT cl.claim_id, cl.policy_id, cl.claimed_amount, cl.claim_status FROM CLAIM cl
          LEFT JOIN CLAIM_SETTLEMENT cs ON cl.claim_id = cs.claim_id WHERE cs.settlement_id IS NULL ORDER BY cl.claim_id`,
  },
  settlementsWithoutPayment: {
    title: "Settlements without payment",
    sql: `SELECT cs.settlement_id, cs.claim_id, cs.settlement_amount, cs.settlement_status FROM CLAIM_SETTLEMENT cs
          LEFT JOIN PAYMENT p ON cs.settlement_id = p.settlement_id WHERE p.payment_id IS NULL ORDER BY cs.settlement_id`,
  },
  highPriority: {
    title: "High and critical priority claims (view vw_claim_summary)",
    sql: `SELECT * FROM vw_claim_summary WHERE claim_priority IN ('High', 'Critical') ORDER BY claim_date DESC`,
  },
};

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const results = await Promise.all(
      Object.entries(REPORTS).map(async ([key, report]) => {
        try {
          const [rows] = await pool.query<RowDataPacket[]>(report.sql);
          return { key, title: report.title, rows, error: null };
        } catch (error) {
          // e.g. view/function not installed yet — report it instead of failing every report.
          return { key, title: report.title, rows: [], error: (error as { sqlMessage?: string }).sqlMessage ?? "Query failed" };
        }
      })
    );
    return ok({ reports: results });
  } catch (error) {
    return handleError(error, "run reports");
  }
}
