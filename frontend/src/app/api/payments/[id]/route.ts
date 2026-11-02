import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { canReversePayment } from "@/lib/rules";
import { idParam, readJson, str } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

/**
 * Reverses a payment (Admin only). The payment row is kept for audit; its status becomes
 * "Reversed" so it no longer counts toward the settlement. Runs in a transaction that locks
 * the settlement and payment, and re-opens a "Paid" settlement that now has a balance.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "payment:write");
    const id = idParam((await params).id);
    const body = await readJson(request);
    if (body.payment_status !== "Reversed") throw new ApiError(400, "Only reversing a payment is supported.");
    const reason = str(body, "reason", { required: true, max: 200 })!;

    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT settlement_id, payment_amount, payment_status FROM PAYMENT WHERE payment_id = ?",
        [id]
      );
      const payment = rows[0];
      if (!payment) throw new ApiError(404, "Payment not found.");
      const [settlements] = await connection.query<RowDataPacket[]>(
        "SELECT claim_id, settlement_status FROM CLAIM_SETTLEMENT WHERE settlement_id = ? FOR UPDATE",
        [payment.settlement_id]
      );
      await connection.query("SELECT payment_id FROM PAYMENT WHERE payment_id = ? FOR UPDATE", [id]);
      const problem = canReversePayment(payment.payment_status ?? "Completed");
      if (problem) throw new ApiError(409, problem);
      await connection.query("UPDATE PAYMENT SET payment_status = 'Reversed' WHERE payment_id = ?", [id]);
      const reopened = settlements[0]?.settlement_status === "Paid";
      if (reopened)
        await connection.query("UPDATE CLAIM_SETTLEMENT SET settlement_status = 'Approved' WHERE settlement_id = ?", [payment.settlement_id]);
      return { claimId: Number(settlements[0]?.claim_id), amount: Number(payment.payment_amount), reopened };
    });

    await logActivity(user, {
      claim_id: result.claimId,
      action: "PAYMENT_REVERSED",
      entity: "PAYMENT",
      entity_id: id,
      details: { amount: result.amount, reason, settlement_reopened: result.reopened },
    });
    return ok({ success: true, settlement_reopened: result.reopened });
  } catch (error) {
    return handleError(error, "reverse payment");
  }
}
