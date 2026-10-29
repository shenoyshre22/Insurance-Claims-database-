import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

interface PolicyRow extends RowDataPacket {
  policy_id: number | string;
  customer_name: string | null;
  policy_name: string | null;
  start_date: string | null;
  end_date: string | null;
  premium_amount: number | string | null;
  coverage_amount: number | string | null;
  policy_status: string | null;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const searchClause = search
    ? `WHERE CAST(p.policy_id AS CHAR) LIKE ?
       OR c.name LIKE ?
       OR pt.policy_name LIKE ?`
    : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  try {
    const [[policies], [totalRows], [typeRows], [activeRows]] = await Promise.all([
      pool.query<PolicyRow[]>(
        `SELECT
           p.policy_id,
           c.name AS customer_name,
           pt.policy_name,
           p.start_date,
           p.end_date,
           p.premium_amount,
           p.coverage_amount,
           p.policy_status
         FROM INSURANCE_POLICY p
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         ${searchClause}
         ORDER BY p.policy_id`,
        searchParams
      ),
      pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM INSURANCE_POLICY"),
      pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM POLICY_TYPE"),
      pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total FROM INSURANCE_POLICY WHERE policy_status = 'Active'"
      ),
    ]);

    return NextResponse.json({
      policies,
      total: Number(totalRows[0]?.total ?? 0),
      policyTypes: Number(typeRows[0]?.total ?? 0),
      activePolicies: Number(activeRows[0]?.total ?? 0),
    });
  } catch (error) {
    console.error("Policies query failed:", error);
    return NextResponse.json({ message: "Unable to retrieve policies." }, { status: 500 });
  }
}
