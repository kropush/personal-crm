import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export const testPostgresPort = Number(process.env.CRM_TEST_POSTGRES_PORT);

type TestDb = Awaited<ReturnType<typeof openTestDatabase>>["db"];

export async function migrateThrough(db: TestDb, tag: string) {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string }[];
  };
  const lastIndex = journal.entries.findIndex((entry) => entry.tag === tag);
  if (lastIndex === -1) throw new Error(`Unknown migration: ${tag}`);

  const entries = journal.entries.slice(0, lastIndex + 1);
  const folder = await mkdtemp(join(tmpdir(), "crm-migrations-"));
  const meta = join(folder, "meta");
  const journalPath = join(meta, "_journal.json");
  const filenames = entries.map((entry) => `${entry.tag}.sql`);

  await mkdir(meta);
  try {
    await writeFile(journalPath, JSON.stringify({ ...journal, entries }));
    for (const filename of filenames) {
      await copyFile(join("drizzle", filename), join(folder, filename));
    }
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await Promise.allSettled([
      unlink(journalPath),
      ...filenames.map((filename) => unlink(join(folder, filename))),
    ]);
    await rmdir(meta);
    await rmdir(folder);
  }
}

export async function openTestDatabase() {
  const connection = {
    host: "127.0.0.1",
    port: testPostgresPort,
    user: "postgres",
    database: "postgres",
  };
  const admin = new Pool(connection);
  const database = `crm_test_${randomUUID().replaceAll("-", "")}`;

  try {
    await admin.query(`CREATE DATABASE "${database}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }

  const pool = new Pool({ ...connection, database });
  return {
    db: drizzle({ client: pool }),
    pool,
    async close() {
      await pool.end();
      try {
        await admin.query(`DROP DATABASE "${database}"`);
      } finally {
        await admin.end();
      }
    },
  };
}
