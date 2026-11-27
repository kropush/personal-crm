import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

import { normalizeLoginEmail } from "../lib/login-email";

export async function migrateDatabase(pool: Pool, ownerEmail?: string) {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('personal-crm:migrations'))");
    await client.query("select set_config('crm.owner_email', $1, false)", [
      normalizeLoginEmail(ownerEmail) ?? "",
    ]);
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    // Close this connection to clear its migration settings and release the lock.
    client.release(true);
  }
}
