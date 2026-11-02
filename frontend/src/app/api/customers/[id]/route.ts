import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { updateRow } from "@/lib/schema";
import { idParam, readJson } from "@/lib/validate";
import { logActivity } from "@/lib/activity";
import { coerceCustomer } from "../coerce";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireUser(request);
    const id = idParam((await params).id);
    const [[customers], [policies]] = await Promise.all([
      pool.query<RowDataPacket[]>("SELECT * FROM CUSTOMER WHERE customer_id = ?", [id]),
      pool.query<RowDataPacket[]>(
        `SELECT p.policy_id, pt.policy_name, p.start_date, p.end_date, p.coverage_amount, p.policy_status,
                (SELECT COUNT(*) FROM CLAIM cl WHERE cl.policy_id = p.policy_id) AS claim_count
         FROM INSURANCE_POLICY p
         JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id
         WHERE p.customer_id = ?
         ORDER BY p.start_date DESC`,
        [id]
      ),
    ]);
    if (!customers[0]) throw new ApiError(404, "Customer not found.");
    return ok({ customer: customers[0], policies });
  } catch (error) {
    return handleError(error, "retrieve customer");
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "customer:write");
    const id = idParam((await params).id);
    const values = await coerceCustomer(await readJson(request), false);
    await updateRow(pool, "CUSTOMER", "customer_id", id, values);
    await logActivity(user, { claim_id: null, action: "CUSTOMER_UPDATED", entity: "CUSTOMER", entity_id: id, details: { fields: Object.keys(values) } });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update customer");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "customer:delete");
    const id = idParam((await params).id);
    // Referential integrity: refuse when the customer still owns policies (explicit check + FK as backstop).
    const [refs] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM INSURANCE_POLICY WHERE customer_id = ?", [id]);
    if (Number(refs[0].total) > 0) throw new ApiError(409, "This customer has policies. Remove or reassign them first.");
    const [result] = await pool.query("DELETE FROM CUSTOMER WHERE customer_id = ?", [id]);
    if ((result as { affectedRows: number }).affectedRows === 0) throw new ApiError(404, "Customer not found.");
    await logActivity(user, { claim_id: null, action: "CUSTOMER_DELETED", entity: "CUSTOMER", entity_id: id });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "delete customer");
  }
}
