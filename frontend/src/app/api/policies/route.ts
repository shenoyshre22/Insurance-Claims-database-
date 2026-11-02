import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { insertRow } from "@/lib/schema";
import { POLICY_STATUSES } from "@/lib/rules";
import { readJson } from "@/lib/validate";
import { logActivity } from "@/lib/activity";
import { validatePolicyBody } from "./shared";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (search) {
      conditions.push("(CAST(p.policy_id AS CHAR) LIKE ? OR c.name LIKE ? OR pt.policy_name LIKE ?)");
      parameters.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status && (POLICY_STATUSES as readonly string[]).includes(status)) {
      conditions.push("p.policy_status = ?");
      parameters.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[policies], [totalRows], [typeRows], [activeRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT
           p.policy_id, p.customer_id, p.policy_type_id,
           c.name AS customer_name,
           pt.policy_name,
           p.start_date, p.end_date, p.premium_amount, p.coverage_amount, p.policy_status,
           COUNT(cl.claim_id) AS claim_count,
           COALESCE(SUM(cl.claimed_amount), 0) AS total_claimed
         FROM INSURANCE_POLICY p
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         LEFT JOIN CLAIM cl ON cl.policy_id = p.policy_id
         ${where}
         GROUP BY p.policy_id, c.name, pt.policy_name
         ORDER BY p.policy_id`,
        parameters
      ),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM INSURANCE_POLICY"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM POLICY_TYPE"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM INSURANCE_POLICY WHERE policy_status = 'Active'"),
    ]);

    return ok({
      policies,
      total: Number(totalRows[0]?.total ?? 0),
      policyTypes: Number(typeRows[0]?.total ?? 0),
      activePolicies: Number(activeRows[0]?.total ?? 0),
    });
  } catch (error) {
    return handleError(error, "retrieve policies");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "policy:write");
    const values = await validatePolicyBody(await readJson(request), true);
    const id = await withTransaction((connection) => insertRow(connection, "INSURANCE_POLICY", "policy_id", values));
    await logActivity(user, { claim_id: null, action: "POLICY_CREATED", entity: "INSURANCE_POLICY", entity_id: id });
    return ok({ policy_id: id }, 201);
  } catch (error) {
    return handleError(error, "create policy");
  }
}
