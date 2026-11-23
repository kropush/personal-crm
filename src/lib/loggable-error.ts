import "server-only";

import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

// Personal data must not reach the server logs. A raw database error carries it:
// Drizzle puts every query parameter (name, phone, email, note text) into its
// message, and Postgres may put the whole failing row into `detail` or quote
// a value in `message`. So only technical fields are kept: the query with $1
// placeholders, the Postgres error code (SQLSTATE) and the names of the table,
// column and constraint. The stack is dropped too: its first line repeats the
// message.

const MAX_CAUSE_DEPTH = 3;

type LoggableError = { [field: string]: string | LoggableError | undefined };

// So that the log line does not list fields that are not there
function withoutEmpty(fields: LoggableError): LoggableError {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function readCode(error: Error) {
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}

export function describeError(error: unknown, depth = 0): LoggableError {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }

  const cause =
    error.cause !== undefined && depth < MAX_CAUSE_DEPTH
      ? describeError(error.cause, depth + 1)
      : undefined;

  if (error instanceof DrizzleQueryError) {
    return withoutEmpty({
      name: "DrizzleQueryError",
      query: error.query,
      cause,
    });
  }

  if (error instanceof DatabaseError) {
    return withoutEmpty({
      name: "DatabaseError",
      code: error.code,
      severity: error.severity,
      table: error.table,
      column: error.column,
      constraint: error.constraint,
      routine: error.routine,
    });
  }

  // Not from the database, for example ECONNREFUSED when it is down:
  // these messages hold no user input
  return withoutEmpty({
    name: error.name,
    code: readCode(error),
    message: error.message,
    cause,
  });
}

export function logError(message: string, error: unknown) {
  console.error(message, describeError(error));
}
