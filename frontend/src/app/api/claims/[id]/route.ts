import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { CLAIM_PRIORITIES, CLAIM_STATUSES, canTransitionClaim } from "@/lib/rules";
import { idParam, num, oneOf, readJson, str } from "@/lib/validate";
import { logActivity } from "@/lib/activity";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireUser(request);
    const id = idParam((await params).id);
    const [[claims], [assessments], [settlements], [payments]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT cl.*, c.customer_id, c.name AS customer_name, pt.policy_name, p.coverage_amount, p.policy_status,
                p.start_date AS policy_start, p.end_date AS policy_end,
                i.incident_type, i.incident_date, i.location AS incident_location, i.description AS incident_description
         FROM CLAIM cl
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         JOIN INCIDENT i ON cl.incident_id = i.incident_id
         WHERE cl.claim_id = ?`,
        [id]
      ),
      pool.query<RowDataPacket[]>(
        `SELECT ca.*, a.name AS assessor_name FROM CLAIM_ASSESSMENT ca
         JOIN ASSESSOR a ON ca.assessor_id = a.assessor_id
         WHERE ca.claim_id = ? ORDER BY ca.assessment_date DESC`,
        [id]
      ),
      pool.query<RowDataPacket[]>("SELECT * FROM CLAIM_SETTLEMENT WHERE claim_id = ?", [id]),
      pool.query<RowDataPacket[]>(
        `SELECT pay.* FROM PAYMENT pay JOIN CLAIM_SETTLEMENT cs ON pay.settlement_id = cs.settlement_id
         WHERE cs.claim_id = ? ORDER BY pay.payment_id`,
        [id]
      ),
    ]);
    if (!claims[0]) throw new ApiError(404, "Claim not found.");

    // Stored function from the existing script; optional so the page still works if it was not created.
    let settlementPercentage: number | null = null;
    try {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT CalculateSettlementPercentage(?) AS pct", [id]);
      settlementPercentage = rows[0]?.pct == null ? null : Number(rows[0].pct);
    } catch {
      settlementPercentage = null;
    }

    let nosql = { evidence: 0, investigations: 0, activities: 0, communications: 0 };
    try {
      const db = await getMongoDb();
      const [evidence, investigations, activities, communications] = await Promise.all([
        db.collection(COLLECTIONS.evidence).countDocuments({ claim_id: id }),
        db.collection(COLLECTIONS.investigations).countDocuments({ claim_id: id }),
        db.collection(COLLECTIONS.activity).countDocuments({ claim_id: id }),
        db.collection(COLLECTIONS.communications).countDocuments({ claim_id: id }),
      ]);
      nosql = { evidence, investigations, activities, communications };
    } catch {
      // MongoDB unavailable: relational detail is still returned.
    }

    return ok({ claim: claims[0], assessments, settlement: settlements[0] ?? null, payments, settlementPercentage, nosql });
  } catch (error) {
    return handleError(error, "retrieve claim");
  }
}

interface ClaimLock extends RowDataPacket {
  claim_status: string;
  claimed_amount: string;
  coverage_amount: string;
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "claim:write");
    const id = idParam((await params).id);
    const body = await readJson(request);
    const status = oneOf(body, "claim_status", CLAIM_STATUSES);
    const priority = oneOf(body, "claim_priority", CLAIM_PRIORITIES);
    const description = body.claim_description === undefined ? undefined : str(body, "claim_description", { max: 500 });
    const amount = num(body, "claimed_amount", { min: 0.01 });

    const previous = await withTransaction(async (connection) => {
      const [rows] = await connection.query<ClaimLock[]>(
        `SELECT cl.claim_status, cl.claimed_amount, p.coverage_amount
         FROM CLAIM cl JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         WHERE cl.claim_id = ? FOR UPDATE`,
        [id]
      );
      const current = rows[0];
      if (!current) throw new ApiError(404, "Claim not found.");
      if (status && status === "Settled" && current.claim_status !== "Settled")
        throw new ApiError(400, "Claims become Settled automatically when a settlement is created.");
      if (status && !canTransitionClaim(current.claim_status, status))
        throw new ApiError(400, `A ${current.claim_status} claim cannot be moved to ${status}.`);
      if (amount != null) {
        if (current.claim_status !== "Pending") throw new ApiError(400, "The claimed amount can only be changed while the claim is Pending.");
        if (amount > Number(current.coverage_amount)) throw new ApiError(400, "Claimed amount cannot exceed the policy coverage amount.");
      }
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      if (status) { sets.push("claim_status = ?"); values.push(status); }
      if (priority) { sets.push("claim_priority = ?"); values.push(priority); }
      if (description !== undefined) { sets.push("claim_description = ?"); values.push(description); }
      if (amount != null) { sets.push("claimed_amount = ?"); values.push(amount); }
      if (sets.length === 0) throw new ApiError(400, "Nothing to update.");
      await connection.query(`UPDATE CLAIM SET ${sets.join(", ")} WHERE claim_id = ?`, [...values, id]);
      return current.claim_status;
    });

    await logActivity(user, {
      claim_id: id,
      action: status && status !== previous ? "CLAIM_STATUS_CHANGED" : "CLAIM_UPDATED",
      entity: "CLAIM",
      entity_id: id,
      from_status: previous,
      to_status: status ?? previous,
      details: { priority, amount, description_changed: description !== undefined },
    });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update claim");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "claim:delete");
    const id = idParam((await params).id);
    await withTransaction(async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT cl.incident_id,
                (SELECT COUNT(*) FROM CLAIM_ASSESSMENT WHERE claim_id = cl.claim_id) AS assessments,
                (SELECT COUNT(*) FROM CLAIM_SETTLEMENT WHERE claim_id = cl.claim_id) AS settlements
         FROM CLAIM cl WHERE cl.claim_id = ? FOR UPDATE`,
        [id]
      );
      const claim = rows[0];
      if (!claim) throw new ApiError(404, "Claim not found.");
      if (Number(claim.assessments) > 0 || Number(claim.settlements) > 0)
        throw new ApiError(409, "Claims with assessments or settlements cannot be deleted.");
      await connection.query("DELETE FROM CLAIM WHERE claim_id = ?", [id]);
      const [others] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CLAIM WHERE incident_id = ?", [claim.incident_id]);
      if (Number(others[0].total) === 0) await connection.query("DELETE FROM INCIDENT WHERE incident_id = ?", [claim.incident_id]);
    });
    await logActivity(user, { claim_id: id, action: "CLAIM_DELETED", entity: "CLAIM", entity_id: id });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "delete claim");
  }
}
