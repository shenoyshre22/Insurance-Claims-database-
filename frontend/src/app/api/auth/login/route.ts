import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { handleError, ApiError } from "@/lib/http";
import { readJson, str } from "@/lib/validate";
import { newSessionToken, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_HOURS, hashToken } from "@/lib/auth";

interface UserRow extends RowDataPacket {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  password_hash: string;
  is_active: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const email = str(body, "email", { required: true, max: 120 })!.toLowerCase();
    const password = str(body, "password", { required: true, max: 200 })!;

    const [rows] = await pool.query<UserRow[]>(
      "SELECT user_id, full_name, email, role, password_hash, is_active FROM APP_USER WHERE email = ?",
      [email]
    );
    const user = rows[0];
    // Same message for unknown email and wrong password to avoid account enumeration.
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, "Invalid email or password.");
    }

    const token = newSessionToken();
    await pool.query("DELETE FROM APP_SESSION WHERE user_id = ? AND expires_at <= NOW()", [user.user_id]);
    await pool.query(
      "INSERT INTO APP_SESSION (session_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))",
      [hashToken(token), user.user_id, SESSION_HOURS]
    );
    await pool.query("UPDATE APP_USER SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);

    const response = NextResponse.json({
      user: { user_id: user.user_id, full_name: user.full_name, email: user.email, role: user.role },
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_HOURS * 3600,
    });
    return response;
  } catch (error) {
    return handleError(error, "sign in");
  }
}
