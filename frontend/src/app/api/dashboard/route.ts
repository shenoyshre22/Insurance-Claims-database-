
import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [
      [customers],
      [policies],
      [claims],
      [settlements],
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM CUSTOMER"),
      pool.query("SELECT COUNT(*) AS total FROM INSURANCE_POLICY"),
      pool.query("SELECT COUNT(*) AS total FROM CLAIM"),
      pool.query("SELECT COUNT(*) AS total FROM CLAIM_SETTLEMENT"),
    ]);

    return NextResponse.json({
      customers: (customers as any[])[0].total,
      policies: (policies as any[])[0].total,
      claims: (claims as any[])[0].total,
      settlements: (settlements as any[])[0].total,
    });
  } catch (error) {
    console.error("Dashboard statistics error:", error);

    return NextResponse.json(
      { message: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
