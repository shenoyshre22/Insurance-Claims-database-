import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { hasColumn, insertRow } from "@/lib/schema";
import { PAYMENT_METHODS, validatePayment } from "@/lib/rules";
import { date, num, oneOf, readJson, str, today } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const where = search
      ? "WHERE CAST(pay.payment_id AS CHAR) LIKE ? OR CAST(cs.claim_id AS CHAR) LIKE ? OR c.name LIKE ?"
      : "";
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const [[payments], [summary], [byMethod], [outstanding]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT pay.*, cs.claim_id, cs.settlement_amount, c.name AS customer_name
         FROM PAYMENT pay
         JOIN CLAIM_SETTLEMENT cs ON pay.settlement_id = cs.settlement_id
         JOIN CLAIM cl ON cs.claim_id = cl.claim_id
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         ${where}
         ORDER BY pay.payment_id DESC`,
        params
      ),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total, COALESCE(SUM(payment_amount), 0) AS amount FROM PAYMENT WHERE COALESCE(payment_status, 'Completed') <> 'Reversed'"),
      (await hasColumn("PAYMENT", "payment_method"))
        ? pool.query<RowDataPacket[]>(
            "SELECT payment_method, COUNT(*) AS total, SUM(payment_amount) AS amount FROM PAYMENT WHERE COALESCE(payment_status, 'Completed') <> 'Reversed' GROUP BY payment_method ORDER BY amount DESC"
          )
        : Promise.resolve([[]] as unknown as [RowDataPacket[]]),
      // Settlements with an outstanding balance (HAVING on an aggregate).
      pool.query<RowDataPacket[]>(
        `SELECT cs.settlement_id, cs.claim_id, cs.settlement_amount, cs.settlement_status, c.name AS customer_name,
                COALESCE(SUM(pay.payment_amount), 0) AS total_paid,
                cs.settlement_amount - COALESCE(SUM(pay.payment_amount), 0) AS outstanding
         FROM CLAIM_SETTLEMENT cs
         JOIN CLAIM cl ON cs.claim_id = cl.claim_id
         JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
         JOIN CUSTOMER c ON p.customer_id = c.customer_id
         LEFT JOIN PAYMENT pay ON pay.settlement_id = cs.settlement_id AND COALESCE(pay.payment_status, 'Completed') <> 'Reversed'
         WHERE cs.settlement_status IS NULL OR cs.settlement_status <> 'Cancelled'
         GROUP BY cs.settlement_id, cs.claim_id, cs.settlement_amount, cs.settlement_status, c.name
         HAVING outstanding > 0
         ORDER BY outstanding DESC`
      ),
    ]);

    return ok({
      payments,
      total: Number(summary[0].total),
      totalAmount: Number(summary[0].amount),
      byMethod,
      outstanding,
    });
  } catch (error) {
    return handleError(error, "retrieve payments");
  }
}

/**
 * Records a payment. Runs in a transaction that locks the settlement row, so concurrent
 * requests cannot overpay; duplicate transaction references are rejected (and also blocked
 * by a UNIQUE index added in database/migrations).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "payment:write");
    const body = await readJson(request);
    const settlementId = num(body, "settlement_id", { required: true, integer: true, min: 1 })!;
    const amount = num(body, "payment_amount", { required: true, min: 0.01 })!;
    const paymentDate = date(body, "payment_date") ?? today();
    const method = oneOf(body, "payment_method", PAYMENT_METHODS, { required: true })!;
    const reference = str(body, "transaction_reference", { max: 50 });
    if (paymentDate > today()) throw new ApiError(400, "Payment date cannot be in the future.");

    const result = await withTransaction(async (connection) => {
      const [settlements] = await connection.query<RowDataPacket[]>(
        "SELECT claim_id, settlement_amount, settlement_status FROM CLAIM_SETTLEMENT WHERE settlement_id = ? FOR UPDATE",
        [settlementId]
      );
      const settlement = settlements[0];
      if (!settlement) throw new ApiError(400, "Selected settlement does not exist.");
      const [paidRows] = await connection.query<RowDataPacket[]>(
        "SELECT COALESCE(SUM(payment_amount), 0) AS paid FROM PAYMENT WHERE settlement_id = ? AND COALESCE(payment_status, 'Completed') <> 'Reversed'",
        [settlementId]
      );
      let duplicateReference = false;
      const hasReference = await hasColumn("PAYMENT", "transaction_reference");
      if (reference && hasReference) {
        const [dup] = await connection.query<RowDataPacket[]>("SELECT 1 FROM PAYMENT WHERE transaction_reference = ?", [reference]);
        duplicateReference = dup.length > 0;
      }
      const alreadyPaid = Number(paidRows[0].paid);
      const problem = validatePayment({
        settlementStatus: settlement.settlement_status ?? null,
        settlementAmount: Number(settlement.settlement_amount),
        alreadyPaid,
        paymentAmount: amount,
        duplicateReference,
      });
      if (problem) throw new ApiError(400, problem);

      const paymentId = await insertRow(connection, "PAYMENT", "payment_id", {
        settlement_id: settlementId,
        payment_amount: amount,
        payment_date: paymentDate,
        payment_method: method,
        payment_status: "Completed",
        transaction_reference: reference,
      });
      const fullyPaid = Math.abs(alreadyPaid + amount - Number(settlement.settlement_amount)) < 0.005;
      if (fullyPaid) await connection.query("UPDATE CLAIM_SETTLEMENT SET settlement_status = 'Paid' WHERE settlement_id = ?", [settlementId]);
      return { paymentId, claimId: Number(settlement.claim_id), fullyPaid };
    });

    await logActivity(user, { claim_id: result.claimId, action: "PAYMENT_RECORDED", entity: "PAYMENT", entity_id: result.paymentId, details: { amount, method, fully_paid: result.fullyPaid } });
    return ok({ payment_id: result.paymentId, fully_paid: result.fullyPaid }, 201);
  } catch (error) {
    return handleError(error, "record payment");
  }
}
