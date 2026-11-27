import { spawn } from "node:child_process";
import { once } from "node:events";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { contacts } from "../../src/db/schema";
import { withTemporaryPostgres } from "../temporary-postgres";
import { existingContactNames } from "./fixtures";

async function main() {
  await withTemporaryPostgres("crm_e2e", async (connection) => {
    const pool = new Pool({ ...connection, connectionTimeoutMillis: 1_000 });
    try {
      const db = drizzle({ client: pool });
      await migrate(db, { migrationsFolder: "./drizzle" });
      await db.insert(contacts).values(existingContactNames.map((name) => ({ name })));
    } finally {
      await pool.end();
    }

    const playwright = spawn(
      process.execPath,
      [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)],
      {
        env: {
          ...process.env,
          CRM_E2E: "1",
          POSTGRES_HOST: connection.host,
          POSTGRES_PORT: String(connection.port),
          POSTGRES_USER: connection.user,
          POSTGRES_PASSWORD: connection.password,
          POSTGRES_DB: connection.database,
        },
        stdio: "inherit",
      },
    );
    const [exitCode] = await once(playwright, "exit");
    process.exitCode = exitCode ?? 1;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
