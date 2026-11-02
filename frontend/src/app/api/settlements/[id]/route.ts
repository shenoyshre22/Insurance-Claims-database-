import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { SETTLEMENT_STATUSES } from "@/lib/rules";
import { idParam, oneOf, readJson } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

/** Change settlement status. Cancelling is blocked once money has been paid. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "settlement:write");
    const id = idParam((await params).id);
    const status = oneOf(await readJson(request), "settlement_status", SETTLEMENT_STATUSES, { required: true })!;

    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT cs.claim_id, cs.settlement_status, cs.settlement_amount,
                (SELECT COALESCE(SUM(payment_amount), 0) FROM PAYMENT WHERE settlement_id = cs.settlement_id AND COALESCE(payment_status, 'Completed') <> 'Reversed') AS paid
         FROM CLAIM_SETTLEMENT cs WHERE cs.settlement_id = ? FOR UPDATE`,
        [id]
      );
      const row = rows[0];
      if (!row) throw new ApiError(404, "Settlement not found.");
      const paid = Number(row.paid);
      if (status === "Cancelled" && paid > 0) throw new ApiError(409, "A settlement with payments cannot be cancelled.");
      if (status === "Paid" && paid < Number(row.settlement_amount)) throw new ApiError(400, "Settlement can only be marked Paid once fully paid.");
      await connection.query("UPDATE CLAIM_SETTLEMENT SET settlement_status = ? WHERE settlement_id = ?", [status, id]);
      // A cancelled settlement returns the claim to Approved so it can be settled again later.
      if (status === "Cancelled") await connection.query("UPDATE CLAIM SET claim_status = 'Approved' WHERE claim_id = ?", [row.claim_id]);
      return { claimId: Number(row.claim_id), from: row.settlement_status as string };
    });

    await logActivity(user, { claim_id: result.claimId, action: "SETTLEMENT_STATUS_CHANGED", entity: "CLAIM_SETTLEMENT", entity_id: id, from_status: result.from, to_status: status });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update settlement");
  }
}
