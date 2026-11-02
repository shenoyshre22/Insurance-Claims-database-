import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool, { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { getColumns, insertRow } from "@/lib/schema";
import { readJson } from "@/lib/validate";
import { logActivity } from "@/lib/activity";
import { coerceCustomer } from "./coerce";

const quote = (identifier: string) => `\`${identifier.replace(/`/g, "``")}\``;

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const columns = await getColumns("CUSTOMER");
    if (columns.length === 0) return ok({ message: "Customer data is unavailable" }, 500);

    const searchableTypes = new Set(["char", "varchar", "tinytext", "text", "mediumtext", "longtext", "enum", "set"]);
    const searchable = columns.filter((column) => searchableTypes.has(column.dataType));
    const where = search && searchable.length > 0
      ? `WHERE ${searchable.map((c) => `c.${quote(c.name)} LIKE ?`).join(" OR ")}`
      : "";
    const params = search && searchable.length > 0 ? searchable.map(() => `%${search}%`) : [];

    // Each customer row is enriched with aggregate policy/claim figures (LEFT JOIN + GROUP BY).
    const [[customers], [countRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT c.*,
                COUNT(DISTINCT p.policy_id) AS policy_count,
                COUNT(DISTINCT cl.claim_id) AS claim_count,
                COALESCE(SUM(cl.claimed_amount), 0) AS total_claimed
         FROM CUSTOMER c
         LEFT JOIN INSURANCE_POLICY p ON p.customer_id = c.customer_id
         LEFT JOIN CLAIM cl ON cl.policy_id = p.policy_id
         ${where}
         GROUP BY c.customer_id
         ORDER BY c.${quote(columns[0].name)}`,
        params
      ),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CUSTOMER"),
    ]);

    return ok({
      customers,
      columns: columns.map(({ name }) => name),
      columnMeta: columns,
      total: Number(countRows[0].total),
    });
  } catch (error) {
    return handleError(error, "retrieve customers");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, "customer:write");
    const values = await coerceCustomer(await readJson(request), true);
    const id = await withTransaction((connection) => insertRow(connection, "CUSTOMER", "customer_id", values));
    await logActivity(user, { claim_id: null, action: "CUSTOMER_CREATED", entity: "CUSTOMER", entity_id: id });
    return ok({ customer_id: id }, 201);
  } catch (error) {
    return handleError(error, "create customer");
  }
}
