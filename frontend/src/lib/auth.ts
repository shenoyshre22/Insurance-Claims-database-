import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "./db";
import { ApiError } from "./http";
import { can, type Role } from "./rules";

export const SESSION_COOKIE = "icms_session";
export const SESSION_HOURS = 8;

export interface SessionUser {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
}

interface SessionRow extends RowDataPacket, SessionUser {}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [rows] = await pool.query<SessionRow[]>(
    `SELECT u.user_id, u.full_name, u.email, u.role
     FROM APP_SESSION s
     JOIN APP_USER u ON s.user_id = u.user_id
     WHERE s.session_hash = ? AND s.expires_at > NOW() AND u.is_active = 1`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

/** Backend authorization: throws 401 when signed out, 403 when the role lacks the permission. */
export async function requireUser(request: NextRequest, permission = "read"): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  if (!can(user.role, permission)) throw new ApiError(403, "Your role is not allowed to perform this action.");
  return user;
}
