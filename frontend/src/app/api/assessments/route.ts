import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { insertRow } from "@/lib/schema";
import { RECOMMENDATIONS, statusForRecommendation, validateAssessment } from "@/lib/rules";
import { date, num, oneOf, readJson, str, today } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const recommendation = request.nextUrl.searchParams.get("recommendation")?.trim() ?? "";
    const conditions: string[] = [];
    const parameters: string[] = [];

    if (search) {
      conditions.push(`(
        CAST(ca.assessment_id AS CHAR) LIKE ? OR CAST(ca.claim_id AS CHAR) LIKE ? OR a.name LIKE ? OR
        c.name LIKE ? OR ca.recommendation LIKE ? OR ca.remarks LIKE ?
      )`);
      parameters.push(...Array(6).fill(`%${search}%`));
    }
    if (recommendation) {
      conditions.push("ca.recommendation = ?");
      parameters.push(recommendation);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[assessments], [totalRows], [assessorRows], [recommendationRows], [workload]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT
           ca.assessment_id, ca.claim_id, ca.assessor_id, c.name AS customer_name, a.name AS assessor_name,
           ca.assessment_date, ca.assessed_amount, ca.recommendation, ca.remarks,
           a.specialization AS assessor_specialization, cl.claim_status, cl.claimed_amount
         FROM CLAIM_ASSESSMENT ca
         JOIN ASSESSOR a ON ca.assessor_id = a.assessor_id
         JOIN CLAIM cl ON ca.claim_id = cl.claim_id
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         ${whereClause}
         ORDER BY ca.assessment_date DESC, ca.assessment_id`,
        parameters
      ),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CLAIM_ASSESSMENT"),
      pool.query<RowDataPacket[]>("SELECT COUNT(DISTINCT assessor_id) AS total FROM CLAIM_ASSESSMENT"),
      pool.query<RowDataPacket[]>("SELECT recommendation, COUNT(*) AS total FROM CLAIM_ASSESSMENT GROUP BY recommendation ORDER BY recommendation"),
      // Assessor workload: GROUP BY + aggregate ratio of assessed to claimed.
      pool.query<RowDataPacket[]>(
        `SELECT a.assessor_id, a.name, COUNT(ca.assessment_id) AS assessments,
                ROUND(AVG(ca.assessed_amount / NULLIF(cl.claimed_amount, 0)) * 100, 1) AS avg_approval_pct
         FROM ASSESSOR a
         LEFT JOIN CLAIM_ASSESSMENT ca ON ca.assessor_id = a.assessor_id
         LEFT JOIN CLAIM cl ON cl.claim_id = ca.claim_id
         GROUP BY a.assessor_id, a.name
         ORDER BY assessments DESC`
      ),
    ]);

    return ok({
      assessments,
      total: Number(totalRows[0]?.total ?? 0),
      totalAssessors: Number(assessorRows[0]?.total ?? 0),
      recommendations: recommendationRows.map((row) => ({ value: row.recommendation, count: Number(row.total) })),
      workload,
    });
  } catch (error) {
    return handleError(error, "retrieve assessments");
  }
}

interface ClaimLock extends RowDataPacket {
  claim_status: string;
  claimed_amount: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "assessment:write");
    const body = await readJson(request);
    const claimId = num(body, "claim_id", { required: true, integer: true, min: 1 })!;
    const assessorId = num(body, "assessor_id", { required: true, integer: true, min: 1 })!;
    const assessmentDate = date(body, "assessment_date") ?? today();
    const assessedAmount = num(body, "assessed_amount", { required: true, min: 0 })!;
    const recommendation = oneOf(body, "recommendation", RECOMMENDATIONS, { required: true })!;
    const remarks = str(body, "remarks", { max: 500 });

    const result = await withTransaction(async (connection) => {
      const [claims] = await connection.query<ClaimLock[]>(
        "SELECT claim_status, claimed_amount FROM CLAIM WHERE claim_id = ? FOR UPDATE",
        [claimId]
      );
      const claim = claims[0];
      if (!claim) throw new ApiError(400, "Selected claim does not exist.");
      const [assessors] = await connection.query<RowDataPacket[]>("SELECT 1 FROM ASSESSOR WHERE assessor_id = ?", [assessorId]);
      if (!assessors[0]) throw new ApiError(400, "Selected assessor does not exist.");
      const problem = validateAssessment(Number(claim.claimed_amount), assessedAmount, claim.claim_status);
      if (problem) throw new ApiError(400, problem);

      const assessmentId = await insertRow(connection, "CLAIM_ASSESSMENT", "assessment_id", {
        claim_id: claimId,
        assessor_id: assessorId,
        assessment_date: assessmentDate,
        assessed_amount: assessedAmount,
        recommendation,
        remarks,
      });
      const newStatus = statusForRecommendation(recommendation);
      await connection.query("UPDATE CLAIM SET claim_status = ? WHERE claim_id = ?", [newStatus, claimId]);
      return { assessmentId, from: claim.claim_status, to: newStatus };
    });

    await logActivity(user, {
      claim_id: claimId,
      action: "ASSESSMENT_RECORDED",
      entity: "CLAIM_ASSESSMENT",
      entity_id: result.assessmentId,
      from_status: result.from,
      to_status: result.to,
      details: { assessed_amount: assessedAmount, recommendation },
    });
    return ok({ assessment_id: result.assessmentId, claim_status: result.to }, 201);
  } catch (error) {
    return handleError(error, "create assessment");
  }
}
