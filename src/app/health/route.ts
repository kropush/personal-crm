import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/db";
import { logError } from "@/lib/loggable-error";

// Smoke check after a deploy: the app is up and can reach the database
export async function GET() {
  // Always answer at request time, never from a build-time prerender
  await connection();

  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    logError("Health check failed: database is unreachable", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
