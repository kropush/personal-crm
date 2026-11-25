import { copyFile, mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { expect, it } from "vitest";

import { openTestDatabase, testPostgresPort } from "./database";

type TestDatabase = Awaited<ReturnType<typeof openTestDatabase>>;

async function migrateBeforeGroups(db: TestDatabase["db"]) {
  const tags = ["0000_init", "0001_keep_in_touch"];
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const folder = await mkdtemp(join(tmpdir(), "crm-migrations-"));
  const meta = join(folder, "meta");
  const journalPath = join(meta, "_journal.json");

  try {
    await mkdir(meta);
    await writeFile(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, tags.length) }),
    );
    for (const tag of tags) {
      await copyFile(join("drizzle", `${tag}.sql`), join(folder, `${tag}.sql`));
    }
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await Promise.allSettled([
      unlink(journalPath),
      ...tags.map((tag) => unlink(join(folder, `${tag}.sql`))),
    ]);
    await rmdir(meta);
    await rmdir(folder);
  }
}

it.runIf(testPostgresPort > 0)("upgrades existing contacts without creating groups or changing data", async () => {
  const database = await openTestDatabase();
  const { db, pool } = database;

  try {
    await migrateBeforeGroups(db);
    const seededContacts = await pool.query(
      `INSERT INTO contacts
        (name, about, how_we_met, phone, email, keep_in_touch_frequency, keep_in_touch_set_at, last_contacted_at)
      VALUES
        ('Anna', 'Friend', 'Tennis', '+70000000000', 'anna@example.com', 'month', '2026-01-01', '2026-01-17'),
        ('Boris', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
      RETURNING *`,
    );
    const seededNotes = await pool.query(
      "INSERT INTO notes (contact_id, body) VALUES ($1, $2) RETURNING *",
      [seededContacts.rows[0].id, "Played tennis"],
    );

    await migrate(db, { migrationsFolder: "./drizzle" });

    expect((await pool.query("SELECT * FROM contacts ORDER BY id")).rows).toEqual(
      seededContacts.rows,
    );
    expect((await pool.query("SELECT * FROM notes")).rows).toEqual(seededNotes.rows);
    expect((await pool.query("SELECT * FROM groups")).rows).toEqual([]);
    expect((await pool.query("SELECT * FROM contact_groups")).rows).toEqual([]);
  } finally {
    await database.close();
  }
});
