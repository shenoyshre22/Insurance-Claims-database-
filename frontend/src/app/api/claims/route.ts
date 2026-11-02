import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { insertRow } from "@/lib/schema";
import { CLAIM_PRIORITIES, validateClaimAgainstPolicy } from "@/lib/rules";
import { date, num, oneOf, readJson, str, today } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const sp = request.nextUrl.searchParams;
    const search = sp.get("search")?.trim() ?? "";
    const status = sp.get("status")?.trim() ?? "";
    const priority = sp.get("priority")?.trim() ?? "";
    const from = sp.get("from")?.trim() ?? "";
    const to = sp.get("to")?.trim() ?? "";
    const conditions: string[] = [];
    const parameters: (string | number)[] = [];

    if (search) {
      conditions.push(`(
        CAST(cl.claim_id AS CHAR) LIKE ? OR CAST(p.policy_id AS CHAR) LIKE ? OR c.name LIKE ? OR
        pt.policy_name LIKE ? OR cl.claim_status LIKE ? OR i.incident_type LIKE ? OR
        i.location LIKE ? OR cl.claim_description LIKE ? OR i.description LIKE ?
      )`);
      parameters.push(...Array.from({ length: 9 }, () => `%${search}%`));
    }
    if (status) {
      conditions.push("cl.claim_status = ?");
      parameters.push(status);
    }
    if (priority && (CLAIM_PRIORITIES as readonly string[]).includes(priority)) {
      conditions.push("cl.claim_priority = ?");
      parameters.push(priority);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      conditions.push("cl.claim_date >= ?");
      parameters.push(from);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      conditions.push("cl.claim_date <= ?");
      parameters.push(to);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[claims], [summaryRows], [statusRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT
           cl.claim_id, c.name AS customer_name, p.policy_id, pt.policy_name,
           i.incident_type, i.incident_date, i.location AS incident_location, i.description AS incident_description,
           cl.claim_date, cl.claimed_amount, cl.claim_status, cl.claim_description, cl.claim_priority,
           (SELECT ca.assessed_amount FROM CLAIM_ASSESSMENT ca WHERE ca.claim_id = cl.claim_id
             ORDER BY ca.assessment_date DESC, ca.assessment_id DESC LIMIT 1) AS latest_assessed_amount,
           EXISTS (SELECT 1 FROM CLAIM_SETTLEMENT cs WHERE cs.claim_id = cl.claim_id) AS has_settlement
         FROM CLAIM cl
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         JOIN INCIDENT i ON cl.incident_id = i.incident_id
         ${whereClause}
         ORDER BY cl.claim_date DESC, cl.claim_id`,
        parameters
      ),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total, COALESCE(SUM(claimed_amount), 0) AS amount FROM CLAIM"),
      pool.query<RowDataPacket[]>("SELECT claim_status, COUNT(*) AS total FROM CLAIM GROUP BY claim_status ORDER BY claim_status"),
    ]);

    return ok({
      claims,
      total: Number(summaryRows[0]?.total ?? 0),
      totalClaimedAmount: Number(summaryRows[0]?.amount ?? 0),
      statuses: statusRows.map((row) => ({ value: row.claim_status, count: Number(row.total) })),
    });
  } catch (error) {
    return handleError(error, "retrieve claims");
  }
}

interface PolicyLock extends RowDataPacket {
  policy_status: string;
  start_date: string;
  end_date: string;
  coverage_amount: string;
}

/** Registers an incident and its claim atomically. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "claim:write");
    const body = await readJson(request);
    const policyId = num(body, "policy_id", { required: true, integer: true, min: 1 })!;
    const incidentType = str(body, "incident_type", { required: true, max: 50 })!;
    const incidentDate = date(body, "incident_date", { required: true })!;
    const location = str(body, "location", { max: 150 });
    const incidentDescription = str(body, "incident_description", { max: 500 });
    const claimDate = date(body, "claim_date") ?? today();
    const claimedAmount = num(body, "claimed_amount", { required: true, min: 0.01 })!;
    const claimDescription = str(body, "claim_description", { max: 500 });
    const priority = oneOf(body, "claim_priority", CLAIM_PRIORITIES) ?? "Medium";
    if (incidentDate > today()) throw new ApiError(400, "Incident date cannot be in the future.");

    const claimId = await withTransaction(async (connection) => {
      const [policies] = await connection.query<PolicyLock[]>(
        "SELECT policy_status, start_date, end_date, coverage_amount FROM INSURANCE_POLICY WHERE policy_id = ? FOR UPDATE",
        [policyId]
      );
      const policy = policies[0];
      if (!policy) throw new ApiError(400, "Selected policy does not exist.");
      const problem = validateClaimAgainstPolicy({
        policyStatus: policy.policy_status,
        policyStart: policy.start_date,
        policyEnd: policy.end_date,
        coverageAmount: Number(policy.coverage_amount),
        incidentDate,
        claimDate,
        claimedAmount,
      });
      if (problem) throw new ApiError(400, problem);

      const incidentId = await insertRow(connection, "INCIDENT", "incident_id", {
        policy_id: policyId,
        incident_type: incidentType,
        incident_date: incidentDate,
        location,
        description: incidentDescription,
      });
      return insertRow(connection, "CLAIM", "claim_id", {
        policy_id: policyId,
        incident_id: incidentId,
        claim_date: claimDate,
        claimed_amount: claimedAmount,
        claim_status: "Pending",
        claim_description: claimDescription,
        claim_priority: priority,
      });
    });

    await logActivity(user, { claim_id: claimId, action: "CLAIM_REGISTERED", entity: "CLAIM", entity_id: claimId, to_status: "Pending", details: { claimed_amount: claimedAmount, priority } });
    return ok({ claim_id: claimId }, 201);
  } catch (error) {
    return handleError(error, "register claim");
  }
}

export const dynamic = "force-dynamic";
