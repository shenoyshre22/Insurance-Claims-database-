import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { updateRow } from "@/lib/schema";
import { POLICY_STATUSES } from "@/lib/rules";
import { idParam, oneOf, readJson } from "@/lib/validate";
import { logActivity } from "@/lib/activity";
import { validatePolicyBody } from "../shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireUser(request);
    const id = idParam((await params).id);
    const [[policies], [assets], [claims]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT p.*, c.name AS customer_name, pt.policy_name
         FROM INSURANCE_POLICY p
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         WHERE p.policy_id = ?`,
        [id]
      ),
      pool.query<RowDataPacket[]>("SELECT * FROM INSURED_ASSET WHERE policy_id = ?", [id]),
      pool.query<RowDataPacket[]>(
        "SELECT claim_id, claim_date, claimed_amount, claim_status FROM CLAIM WHERE policy_id = ? ORDER BY claim_date DESC",
        [id]
      ),
    ]);
    if (!policies[0]) throw new ApiError(404, "Policy not found.");
    return ok({ policy: policies[0], assets, claims });
  } catch (error) {
    return handleError(error, "retrieve policy");
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "policy:write");
    const id = idParam((await params).id);
    const values = await validatePolicyBody(await readJson(request), false);
    await updateRow(pool, "INSURANCE_POLICY", "policy_id", id, values);
    await logActivity(user, { claim_id: null, action: "POLICY_UPDATED", entity: "INSURANCE_POLICY", entity_id: id });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update policy");
  }
}

/** Status management (Active / Expired / Cancelled / Suspended). */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "policy:write");
    const id = idParam((await params).id);
    const status = oneOf(await readJson(request), "policy_status", POLICY_STATUSES, { required: true })!;
    if (status === "Cancelled") {
      const [open] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CLAIM WHERE policy_id = ? AND claim_status IN ('Pending', 'Under Review', 'Approved')",
        [id]
      );
      if (Number(open[0].total) > 0) throw new ApiError(409, "This policy has open claims and cannot be cancelled.");
    }
    await updateRow(pool, "INSURANCE_POLICY", "policy_id", id, { policy_status: status });
    await logActivity(user, { claim_id: null, action: "POLICY_STATUS_CHANGED", entity: "INSURANCE_POLICY", entity_id: id, to_status: status });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update policy status");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "policy:delete");
    const id = idParam((await params).id);
    const [refs] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CLAIM WHERE policy_id = ?", [id]);
    if (Number(refs[0].total) > 0) throw new ApiError(409, "This policy has claims and cannot be deleted. Change its status instead.");
    const [result] = await pool.query("DELETE FROM INSURANCE_POLICY WHERE policy_id = ?", [id]);
    if ((result as { affectedRows: number }).affectedRows === 0) throw new ApiError(404, "Policy not found.");
    await logActivity(user, { claim_id: null, action: "POLICY_DELETED", entity: "INSURANCE_POLICY", entity_id: id });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "delete policy");
  }
}
