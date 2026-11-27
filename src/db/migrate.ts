// Applies the migrations from ./drizzle that are not in the database yet.
//
// On the server it runs in a one-off container from the app image before the
// new app version starts (see deploy/deploy.sh). Locally `pnpm db:migrate`
// uses the same script.

import { Pool } from "pg";

import { getDatabaseConfig, loadEnvFileIfPresent } from "./config";
import { migrateDatabase } from "./migrations";

async function main() {
  loadEnvFileIfPresent();

  const pool = new Pool(getDatabaseConfig());
  try {
    await migrateDatabase(pool, process.env.CRM_OWNER_EMAIL);
    console.log("Migrations applied: every migration from ./drizzle is in the database.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exitCode = 1;
});
