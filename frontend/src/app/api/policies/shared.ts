import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { ApiError } from "@/lib/http";
import { POLICY_STATUSES } from "@/lib/rules";
import { date, num, oneOf } from "@/lib/validate";

export async function validatePolicyBody(body: Record<string, unknown>, isCreate: boolean) {
  const customerId = num(body, "customer_id", { required: isCreate, integer: true, min: 1 });
  const policyTypeId = num(body, "policy_type_id", { required: isCreate, integer: true, min: 1 });
  const startDate = date(body, "start_date", { required: isCreate });
  const endDate = date(body, "end_date", { required: isCreate });
  const premium = num(body, "premium_amount", { required: isCreate, min: 0.01 });
  const coverage = num(body, "coverage_amount", { required: isCreate, min: 1 });
  const status = oneOf(body, "policy_status", POLICY_STATUSES) ?? (isCreate ? "Active" : null);

  if (startDate && endDate && endDate <= startDate) throw new ApiError(400, "End date must be after the start date.");
  if (premium != null && coverage != null && premium >= coverage) throw new ApiError(400, "Premium must be lower than the coverage amount.");

  if (customerId != null) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM CUSTOMER WHERE customer_id = ?", [customerId]);
    if (!rows[0]) throw new ApiError(400, "Selected customer does not exist.");
  }
  if (policyTypeId != null) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM POLICY_TYPE WHERE policy_type_id = ?", [policyTypeId]);
    if (!rows[0]) throw new ApiError(400, "Selected policy type does not exist.");
  }

  const values: Record<string, unknown> = {
    customer_id: customerId ?? undefined,
    policy_type_id: policyTypeId ?? undefined,
    start_date: startDate ?? undefined,
    end_date: endDate ?? undefined,
    premium_amount: premium ?? undefined,
    coverage_amount: coverage ?? undefined,
    policy_status: status ?? undefined,
  };
  return values;
}
