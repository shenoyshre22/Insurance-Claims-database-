import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";

/** Dropdown data for forms. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const [[customers], [policyTypes], [policies], [assessors], [claims]] = await Promise.all([
      pool.query<RowDataPacket[]>("SELECT customer_id, name FROM CUSTOMER ORDER BY name"),
      pool.query<RowDataPacket[]>("SELECT * FROM POLICY_TYPE ORDER BY policy_name"),
      pool.query<RowDataPacket[]>(
        `SELECT p.policy_id, c.name AS customer_name, pt.policy_name, p.policy_status, p.start_date, p.end_date, p.coverage_amount
         FROM INSURANCE_POLICY p
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         ORDER BY p.policy_id`
      ),
      pool.query<RowDataPacket[]>("SELECT assessor_id, name, specialization FROM ASSESSOR ORDER BY name"),
      pool.query<RowDataPacket[]>(
        `SELECT cl.claim_id, cl.claim_status, cl.claimed_amount, c.name AS customer_name
         FROM CLAIM cl
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         ORDER BY cl.claim_id DESC`
      ),
    ]);
    return ok({ customers, policyTypes, policies, assessors, claims });
  } catch (error) {
    return handleError(error, "load form options");
  }
}
