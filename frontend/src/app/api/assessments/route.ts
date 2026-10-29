import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

interface AssessmentRow extends RowDataPacket {
  assessment_id: number | string;
  claim_id: number | string;
  customer_name: string | null;
  assessor_name: string | null;
  assessment_date: string | null;
  assessed_amount: number | string | null;
  recommendation: string | null;
  remarks: string | null;
  assessor_specialization: string | null;
  claim_status: string | null;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface RecommendationRow extends RowDataPacket {
  recommendation: string | null;
  total: number | string;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const recommendation = request.nextUrl.searchParams.get("recommendation")?.trim() ?? "";
  const conditions: string[] = [];
  const parameters: string[] = [];

  if (search) {
    conditions.push(`(
      CAST(ca.assessment_id AS CHAR) LIKE ? OR
      CAST(ca.claim_id AS CHAR) LIKE ? OR
      a.name LIKE ? OR
      c.name LIKE ? OR
      ca.recommendation LIKE ? OR
      ca.remarks LIKE ?
    )`);
    parameters.push(...Array(6).fill(`%${search}%`));
  }

  if (recommendation) {
    conditions.push("ca.recommendation = ?");
    parameters.push(recommendation);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [[assessments], [totalRows], [assessorRows], [recommendationRows]] = await Promise.all([
      pool.query<AssessmentRow[]>(
        `SELECT
           ca.assessment_id,
           ca.claim_id,
           c.name AS customer_name,
           a.name AS assessor_name,
           ca.assessment_date,
           ca.assessed_amount,
           ca.recommendation,
           ca.remarks,
           a.specialization AS assessor_specialization,
           cl.claim_status
         FROM CLAIM_ASSESSMENT ca
         JOIN ASSESSOR a ON ca.assessor_id = a.assessor_id
         JOIN CLAIM cl ON ca.claim_id = cl.claim_id
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         ${whereClause}
         ORDER BY ca.assessment_date DESC, ca.assessment_id`,
        parameters
      ),
      pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM CLAIM_ASSESSMENT"),
      pool.query<CountRow[]>("SELECT COUNT(DISTINCT assessor_id) AS total FROM CLAIM_ASSESSMENT"),
      pool.query<RecommendationRow[]>(
        `SELECT recommendation, COUNT(*) AS total
         FROM CLAIM_ASSESSMENT
         GROUP BY recommendation
         ORDER BY recommendation`
      ),
    ]);

    return NextResponse.json({
      assessments,
      total: Number(totalRows[0]?.total ?? 0),
      totalAssessors: Number(assessorRows[0]?.total ?? 0),
      recommendations: recommendationRows.map((row) => ({
        value: row.recommendation,
        count: Number(row.total),
      })),
    });
  } catch (error) {
    console.error("Assessments query failed:", error);
    return NextResponse.json({ message: "Unable to retrieve assessments." }, { status: 500 });
  }
}
