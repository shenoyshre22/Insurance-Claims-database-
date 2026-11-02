import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "./db";
import { ApiError } from "./http";

export interface ColumnMeta {
  name: string;
  dataType: string;
  columnType: string;
  nullable: boolean;
  hasDefault: boolean;
  autoIncrement: boolean;
  primaryKey: boolean;
  maxLength: number | null;
}

interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
  COLUMN_KEY: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
}

// Only these tables may be introspected or written through the generic helpers.
const ALLOWED_TABLES = new Set([
  "CUSTOMER", "POLICY_TYPE", "INSURANCE_POLICY", "INSURED_ASSET", "INCIDENT",
  "CLAIM", "ASSESSOR", "CLAIM_ASSESSMENT", "CLAIM_SETTLEMENT", "PAYMENT",
]);

const cache = new Map<string, { at: number; columns: ColumnMeta[] }>();

/** Reads column metadata from information_schema (cached for 60s). */
export async function getColumns(table: string): Promise<ColumnMeta[]> {
  if (!ALLOWED_TABLES.has(table)) throw new ApiError(500, "Unknown table.");
  const hit = cache.get(table);
  if (hit && Date.now() - hit.at < 60_000) return hit.columns;
  const [rows] = await pool.query<ColumnRow[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_KEY, CHARACTER_MAXIMUM_LENGTH
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table]
  );
  const columns = rows.map((row) => ({
    name: row.COLUMN_NAME,
    dataType: row.DATA_TYPE,
    columnType: row.COLUMN_TYPE,
    nullable: row.IS_NULLABLE === "YES",
    hasDefault: row.COLUMN_DEFAULT !== null,
    autoIncrement: row.EXTRA.includes("auto_increment"),
    primaryKey: row.COLUMN_KEY === "PRI",
    maxLength: row.CHARACTER_MAXIMUM_LENGTH == null ? null : Number(row.CHARACTER_MAXIMUM_LENGTH),
  }));
  cache.set(table, { at: Date.now(), columns });
  return columns;
}

export async function hasColumn(table: string, column: string) {
  return (await getColumns(table)).some((c) => c.name === column);
}

const quote = (identifier: string) => `\`${identifier.replace(/`/g, "``")}\``;

/** Keeps only keys that are real columns of the table (column names come from information_schema, never from the user). */
export async function pickColumns(table: string, data: Record<string, unknown>) {
  const columns = await getColumns(table);
  const names = new Set(columns.map((c) => c.name));
  return Object.fromEntries(Object.entries(data).filter(([key, value]) => names.has(key) && value !== undefined));
}

/**
 * Inserts a row using parameterized values. If the primary key is not AUTO_INCREMENT
 * (the existing schema uses manual IDs like 501), the next ID is allocated inside the
 * caller's transaction with a locking read.
 */
export async function insertRow(connection: PoolConnection, table: string, idColumn: string, data: Record<string, unknown>): Promise<number> {
  const columns = await getColumns(table);
  const idMeta = columns.find((c) => c.name === idColumn);
  const values = await pickColumns(table, data);
  let id: number | null = null;
  if (idMeta && !idMeta.autoIncrement) {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(${quote(idColumn)}), 0) + 1 AS next_id FROM ${quote(table)} FOR UPDATE`
    );
    id = Number(rows[0].next_id);
    values[idColumn] = id;
  } else {
    delete values[idColumn];
  }
  const keys = Object.keys(values);
  const [result] = await connection.query(
    `INSERT INTO ${quote(table)} (${keys.map(quote).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    keys.map((k) => values[k])
  );
  return id ?? Number((result as { insertId: number }).insertId);
}

export async function updateRow(connection: PoolConnection | typeof pool, table: string, idColumn: string, id: number, data: Record<string, unknown>) {
  const values = await pickColumns(table, data);
  delete values[idColumn];
  const keys = Object.keys(values);
  if (keys.length === 0) throw new ApiError(400, "No valid fields to update.");
  const [result] = await connection.query(
    `UPDATE ${quote(table)} SET ${keys.map((k) => `${quote(k)} = ?`).join(", ")} WHERE ${quote(idColumn)} = ?`,
    [...keys.map((k) => values[k]), id]
  );
  if ((result as { affectedRows: number }).affectedRows === 0) throw new ApiError(404, "Record not found.");
}
