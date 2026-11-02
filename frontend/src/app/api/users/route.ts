import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { hashPassword, passwordProblem } from "@/lib/password";
import { ROLES } from "@/lib/rules";
import { oneOf, readJson, str } from "@/lib/validate";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, "user:manage");
    const [users] = await pool.query<RowDataPacket[]>(
      `SELECT user_id, full_name, email, role, is_active, created_at, last_login_at
       FROM APP_USER ORDER BY user_id`
    );
    return ok({ users });
  } catch (error) {
    return handleError(error, "load users");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, "user:manage");
    const body = await readJson(request);
    const fullName = str(body, "full_name", { required: true, max: 100 })!;
    const email = str(body, "email", { required: true, max: 120 })!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address.");
    const role = oneOf(body, "role", ROLES, { required: true })!;
    const password = str(body, "password", { required: true, max: 200 })!;
    const problem = passwordProblem(password);
    if (problem) throw new ApiError(400, problem);
    const [result] = await pool.query(
      "INSERT INTO APP_USER (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [fullName, email, hashPassword(password), role]
    );
    return ok({ user_id: (result as { insertId: number }).insertId }, 201);
  } catch (error) {
    return handleError(error, "create user");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireUser(request, "user:manage");
    const body = await readJson(request);
    const userId = Number(body.user_id);
    if (!Number.isInteger(userId)) throw new ApiError(400, "Invalid user.");
    if (userId === admin.user_id) throw new ApiError(400, "You cannot deactivate your own account.");
    const active = body.is_active ? 1 : 0;
    await pool.query("UPDATE APP_USER SET is_active = ? WHERE user_id = ?", [active, userId]);
    if (!active) await pool.query("DELETE FROM APP_SESSION WHERE user_id = ?", [userId]);
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update user");
  }
}
