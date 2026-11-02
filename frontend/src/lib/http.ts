import { NextResponse } from "next/server";

import { ApiError } from "./errors.ts";

export { ApiError };

interface MysqlError {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

/** Converts thrown errors into safe JSON responses without leaking internals. */
export function handleError(error: unknown, context: string) {
  if (error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  const mysqlError = error as MysqlError;
  switch (mysqlError?.code) {
    case "ER_ROW_IS_REFERENCED_2":
    case "ER_ROW_IS_REFERENCED":
      return NextResponse.json({ message: "This record is referenced by other records and cannot be deleted." }, { status: 409 });
    case "ER_NO_REFERENCED_ROW_2":
    case "ER_NO_REFERENCED_ROW":
      return NextResponse.json({ message: "A referenced record does not exist." }, { status: 400 });
    case "ER_DUP_ENTRY":
      return NextResponse.json({ message: "A record with the same unique value already exists." }, { status: 409 });
    case "ER_CHECK_CONSTRAINT_VIOLATED":
    case "ER_TRUNCATED_WRONG_VALUE":
    case "WARN_DATA_TRUNCATED":
    case "ER_BAD_NULL_ERROR":
    case "ER_NO_DEFAULT_FOR_FIELD":
      return NextResponse.json({ message: `Invalid data: ${mysqlError.sqlMessage ?? "constraint violated"}` }, { status: 400 });
    case "ER_SIGNAL_EXCEPTION":
      return NextResponse.json({ message: mysqlError.sqlMessage ?? "Rejected by a database rule." }, { status: 400 });
  }
  console.error(`${context} failed:`, error);
  return NextResponse.json({ message: `Unable to complete request: ${context}.` }, { status: 500 });
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
