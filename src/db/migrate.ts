// Applies the migrations from ./drizzle that are not in the database yet.
//
// On the server it runs in a one-off container from the app image before the
// new app version starts (see deploy/deploy.sh). Locally `pnpm db:migrate`
// does the same through drizzle-kit; both keep track of applied migrations in
// the same drizzle.__drizzle_migrations table.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { getDatabaseConfig, loadEnvFileIfPresent } from "./config";

async function main() {
  loadEnvFileIfPresent();

  const pool = new Pool(getDatabaseConfig());
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied: every migration from ./drizzle is in the database.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exitCode = 1;
});
