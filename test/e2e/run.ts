import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { migrateDatabase } from "../../src/db/migrations";
import { contacts, user } from "../../src/db/schema";
import { migrateThrough } from "../database";
import { withTemporaryMailpit } from "../temporary-mailpit";
import { withTemporaryPostgres } from "../temporary-postgres";
import { demoOwnerEmail, e2eOwner, existingContactNames, legacyData } from "./fixtures";

const demoDatabase = "crm_e2e_demo";

async function main() {
  await withTemporaryPostgres("crm_e2e", async (connection) => {
    const databaseEnv = {
      POSTGRES_HOST: connection.host,
      POSTGRES_PORT: String(connection.port),
      POSTGRES_USER: connection.user,
      POSTGRES_PASSWORD: connection.password,
      POSTGRES_DB: connection.database,
    };
    const pool = new Pool({ ...connection, connectionTimeoutMillis: 1_000 });
    try {
      const db = drizzle({ client: pool });
      await migrateThrough(db, "0002_contact_groups");
      const {
        rows: [legacyContact],
      } = await pool.query(
        `insert into contacts (name, keep_in_touch_frequency, keep_in_touch_set_at, last_contacted_at)
         values ($1, 'month', '2026-01-01', '2026-01-10') returning id`,
        [legacyData.contact],
      );
      const {
        rows: [legacyGroup],
      } = await pool.query("insert into groups (name) values ($1) returning id", [
        legacyData.group,
      ]);
      await pool.query("insert into notes (contact_id, body) values ($1, $2)", [
        legacyContact.id,
        legacyData.note,
      ]);
      await pool.query("insert into contact_groups (contact_id, group_id) values ($1, $2)", [
        legacyContact.id,
        legacyGroup.id,
      ]);
      await migrateDatabase(pool, legacyData.email);
      await db.insert(user).values({ ...e2eOwner, name: "" });
      await db
        .insert(contacts)
        .values(existingContactNames.map((name) => ({ name, ownerId: e2eOwner.id })));
      await pool.query(`create database "${demoDatabase}"`);
    } finally {
      await pool.end();
    }

    const demoPool = new Pool({ ...connection, database: demoDatabase });
    try {
      await migrateDatabase(demoPool);
      const seed = spawn(
        process.execPath,
        [require.resolve("tsx/cli"), resolve("src/db/seed.ts")],
        {
          cwd: resolve("test/e2e"),
          env: {
            ...process.env,
            ...databaseEnv,
            POSTGRES_DB: demoDatabase,
            CRM_OWNER_EMAIL: demoOwnerEmail,
          },
          stdio: "inherit",
        },
      );
      const [exitCode] = await once(seed, "exit");
      if (exitCode !== 0) throw new Error("Could not seed the isolated demo database");
    } finally {
      await demoPool.end();
    }

    await withTemporaryMailpit(async ({ webUrl, smtpPort }) => {
      const playwright = spawn(
        process.execPath,
        [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)],
        {
          env: {
            ...process.env,
            CRM_E2E: "1",
            CRM_APP_URL: "http://127.0.0.1:3100",
            CRM_E2E_DEMO_URL: "http://127.0.0.1:3101",
            CRM_E2E_DEMO_DB: demoDatabase,
            BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
            CRM_MAIL_TRANSPORT: "mailpit",
            CRM_MAILPIT_SMTP_PORT: String(smtpPort),
            CRM_TEST_MAILPIT_URL: webUrl,
            RESEND_API_KEY: "",
            ...databaseEnv,
          },
          stdio: "inherit",
        },
      );
      const [exitCode] = await once(playwright, "exit");
      process.exitCode = exitCode ?? 1;
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
