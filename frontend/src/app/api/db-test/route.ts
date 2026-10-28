
import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [rows] = await pool.query("SELECT 1 AS connection_test");

    return NextResponse.json({
      success: true,
      message: "Successfully connected to MySQL!",
      result: rows,
    });
  } catch (error) {
    console.error("MySQL connection error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "MySQL connection failed. Check your database configuration.",
      },
      { status: 500 }
    );
  }
}
