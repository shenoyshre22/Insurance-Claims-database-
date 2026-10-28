import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

interface ColumnInfo extends RowDataPacket {
  COLUMN_NAME: string;
  DATA_TYPE: string;
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const [columns] = await pool.query<ColumnInfo[]>(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CUSTOMER'
       ORDER BY ORDINAL_POSITION`
    );

    if (columns.length === 0) {
      return NextResponse.json({ message: "Customer data is unavailable" }, { status: 500 });
    }

    const searchableTypes = new Set([
      "char", "varchar", "tinytext", "text", "mediumtext", "longtext", "enum", "set",
    ]);
    const searchableColumns = columns.filter((column) => searchableTypes.has(column.DATA_TYPE));
    const where = search && searchableColumns.length > 0
      ? `WHERE ${searchableColumns.map(({ COLUMN_NAME }) => `CAST(\`${COLUMN_NAME.replace(/`/g, "``")}\` AS CHAR) LIKE ?`).join(" OR ")}`
      : "";
    const params = search && searchableColumns.length > 0
      ? searchableColumns.map(() => `%${search}%`)
      : [];
    const [[customers], [countRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT * FROM CUSTOMER ${where} ORDER BY \`${columns[0].COLUMN_NAME.replace(/`/g, "``")}\``,
        params
      ),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM CUSTOMER"),
    ]);

    return NextResponse.json({
      customers,
      columns: columns.map(({ COLUMN_NAME }) => COLUMN_NAME),
      total: countRows[0].total as number,
    });
  } catch {
    console.error("Customers query failed");
    return NextResponse.json({ message: "Unable to retrieve customers" }, { status: 500 });
  }
}
