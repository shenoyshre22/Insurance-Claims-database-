import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, hashToken } from "@/lib/auth";
import { handleError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) await pool.query("DELETE FROM APP_SESSION WHERE session_hash = ?", [hashToken(token)]);
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return handleError(error, "sign out");
  }
}
