import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

interface ClaimRow extends RowDataPacket {
  claim_id: number;
  customer_name: string;
  policy_id: number;
  policy_name: string;
  incident_type: string;
  incident_date: string;
  incident_location: string | null;
  incident_description: string | null;
  claim_date: string;
  claimed_amount: string | number;
  claim_status: string;
  claim_description: string | null;
  claim_priority: string | null;
}

interface CountRow extends RowDataPacket {
  total: number | string;
  amount: string | number | null;
}

interface StatusRow extends RowDataPacket {
  claim_status: string;
  total: number | string;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
  const conditions: string[] = [];
  const parameters: string[] = [];

  if (search) {
    conditions.push(`(
      CAST(cl.claim_id AS CHAR) LIKE ? OR
      CAST(p.policy_id AS CHAR) LIKE ? OR
      c.name LIKE ? OR
      pt.policy_name LIKE ? OR
      cl.claim_status LIKE ? OR
      i.incident_type LIKE ? OR
      i.location LIKE ? OR
      cl.claim_description LIKE ? OR
      i.description LIKE ?
    )`);
    parameters.push(...Array.from({ length: 9 }, () => `%${search}%`));
  }

  if (status) {
    conditions.push("cl.claim_status = ?");
    parameters.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [[claims], [summaryRows], [statusRows]] = await Promise.all([
      pool.query<ClaimRow[]>(
        `SELECT
           cl.claim_id,
           c.name AS customer_name,
           p.policy_id,
           pt.policy_name,
           i.incident_type,
           i.incident_date,
           i.location AS incident_location,
           i.description AS incident_description,
           cl.claim_date,
           cl.claimed_amount,
           cl.claim_status,
           cl.claim_description,
           cl.claim_priority
         FROM CLAIM cl
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         JOIN INCIDENT i ON cl.incident_id = i.incident_id
         ${whereClause}
         ORDER BY cl.claim_date DESC, cl.claim_id`,
        parameters
      ),
      pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total, COALESCE(SUM(claimed_amount), 0) AS amount FROM CLAIM"
      ),
      pool.query<StatusRow[]>(
        "SELECT claim_status, COUNT(*) AS total FROM CLAIM GROUP BY claim_status ORDER BY claim_status"
      ),
    ]);

    return NextResponse.json({
      claims,
      total: Number(summaryRows[0]?.total ?? 0),
      totalClaimedAmount: Number(summaryRows[0]?.amount ?? 0),
      statuses: statusRows.map((row) => ({
        value: row.claim_status,
        count: Number(row.total),
      })),
    });
  } catch (error) {
    console.error("Claims query failed:", error);
    return NextResponse.json({ message: "Unable to retrieve claims." }, { status: 500 });
  }
}
