import { ApiError } from "@/lib/http";
import { getColumns } from "@/lib/schema";

const NUMERIC = new Set(["int", "tinyint", "smallint", "mediumint", "bigint", "decimal", "float", "double"]);

/**
 * Validates a customer payload against the live CUSTOMER schema: only real columns are
 * accepted, types and lengths are checked, and required columns must be present on create.
 */
export async function coerceCustomer(body: Record<string, unknown>, isCreate: boolean) {
  const columns = await getColumns("CUSTOMER");
  const values: Record<string, unknown> = {};

  for (const column of columns) {
    if (column.primaryKey) continue;
    const raw = body[column.name];
    const label = column.name.replaceAll("_", " ");
    if (raw === undefined) {
      if (isCreate && !column.nullable && !column.hasDefault) throw new ApiError(400, `${label} is required.`);
      continue;
    }
    if (raw === null || raw === "") {
      if (!column.nullable) throw new ApiError(400, `${label} is required.`);
      values[column.name] = null;
      continue;
    }
    const text = String(raw).trim();
    if (NUMERIC.has(column.dataType)) {
      const value = Number(text);
      if (!Number.isFinite(value)) throw new ApiError(400, `${label} must be a number.`);
      values[column.name] = value;
    } else if (column.dataType === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ApiError(400, `${label} must be a date (YYYY-MM-DD).`);
      if (column.name.includes("birth") && text > new Date().toISOString().slice(0, 10))
        throw new ApiError(400, `${label} cannot be in the future.`);
      values[column.name] = text;
    } else {
      if (column.maxLength && text.length > column.maxLength) throw new ApiError(400, `${label} is too long (max ${column.maxLength}).`);
      if (column.name.includes("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new ApiError(400, "Enter a valid email address.");
      if (column.name.includes("phone") && !/^[+\d][\d\s-]{6,19}$/.test(text)) throw new ApiError(400, "Enter a valid phone number.");
      values[column.name] = text;
    }
  }
  return values;
}
