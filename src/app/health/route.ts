import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/db";

// Smoke check after a deploy: the app is up and can reach the database
export async function GET() {
  // Always answer at request time, never from a build-time prerender
  await connection();

  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed: database is unreachable", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
