import type { RowDataPacket } from "mysql2/promise";
import pool from "./db";
import { ApiError } from "./http";

/** MongoDB documents reference MySQL claims by claim_id; this enforces that the claim exists. */
export async function assertClaimExists(claimId: number) {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT claim_status FROM CLAIM WHERE claim_id = ?", [claimId]);
  if (!rows[0]) throw new ApiError(400, `Claim ${claimId} does not exist.`);
  return rows[0].claim_status as string;
}
