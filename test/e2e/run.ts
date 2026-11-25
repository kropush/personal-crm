import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { contacts } from "../../src/db/schema";
import { existingContactNames } from "./fixtures";

function docker(args: string[], env = process.env) {
  return execFileSync("docker", args, { encoding: "utf8", env }).trim();
}

async function prepareDatabase(pool: Pool) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await pool.query("select 1");
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await setTimeout(500);
    }
  }

  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(contacts).values(existingContactNames.map((name) => ({ name })));
}

async function main() {
  const env = {
    ...process.env,
    CRM_E2E: "1",
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: randomUUID(),
    POSTGRES_DB: "crm_e2e",
  };
  const container = docker([
    "run", "--detach", "--rm", "--tmpfs", "/var/lib/postgresql",
    "--publish", `${env.POSTGRES_HOST}::5432`,
    "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB", "postgres:18",
  ], env);

  try {
    const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
    if (!port) throw new Error("Docker did not publish a port for the test database.");

    const pool = new Pool({
      host: env.POSTGRES_HOST,
      port,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      connectionTimeoutMillis: 1_000,
    });
    try {
      await prepareDatabase(pool);
    } finally {
      await pool.end();
    }

    const playwright = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)], {
      env: { ...env, POSTGRES_PORT: String(port) },
      stdio: "inherit",
    });
    const [exitCode] = await once(playwright, "exit");
    process.exitCode = exitCode ?? 1;
  } finally {
    docker(["stop", "--time", "2", container]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
