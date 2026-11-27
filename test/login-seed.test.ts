import { execFile } from "node:child_process";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { migrateDatabase } from "../src/db/migrations";
import { openTestDatabase, testPostgresPort } from "./database";

const run = promisify(execFile);

it.runIf(testPostgresPort > 0)(
  "seeds and resets only the configured owner's contacts and notes",
  async () => {
    const database = await openTestDatabase();
    const directory = await mkdtemp(join(tmpdir(), "crm-seed-"));
    const { pool } = database;
    const seed = (...args: string[]) =>
      run(process.execPath, [require.resolve("tsx/cli"), resolve("src/db/seed.ts"), ...args], {
        cwd: directory,
        env: {
          ...process.env,
          POSTGRES_USER: "postgres",
          POSTGRES_HOST: "127.0.0.1",
          POSTGRES_PORT: String(testPostgresPort),
          POSTGRES_PASSWORD: process.env.CRM_TEST_POSTGRES_PASSWORD,
          POSTGRES_DB: pool.options.database,
          CRM_OWNER_EMAIL: "  Demo@Example.com  ",
        },
      });

    try {
      await migrateDatabase(pool);
      await pool.query(
        `insert into "user" (id, name, email) values ('other', '', 'other@example.com')`,
      );
      const {
        rows: [otherContact],
      } = await pool.query(
        "insert into contacts (name, owner_id) values ('Other contact', 'other') returning *",
      );
      const {
        rows: [otherNote],
      } = await pool.query(
        "insert into notes (contact_id, body) values ($1, 'Other note') returning *",
        [otherContact.id],
      );
      const {
        rows: [otherGroup],
      } = await pool.query(
        "insert into groups (name, owner_id) values ('Other group', 'other') returning *",
      );
      await pool.query(
        "insert into contact_groups (contact_id, group_id, owner_id) values ($1, $2, 'other')",
        [otherContact.id, otherGroup.id],
      );

      await seed();
      const {
        rows: [owner],
      } = await pool.query(
        `select id, email_verified from "user" where email = 'demo@example.com'`,
      );
      expect(owner).toEqual({ id: expect.any(String), email_verified: false });
      const ownerContacts = () =>
        pool.query("select id from contacts where owner_id = $1 order by id", [owner.id]);
      const before = (await ownerContacts()).rows;
      expect(before).toHaveLength(1000);
      const ownerNotes = () =>
        pool.query(
          "select notes.id from notes join contacts on contacts.id = notes.contact_id where contacts.owner_id = $1 order by notes.id",
          [owner.id],
        );
      const notesBefore = (await ownerNotes()).rows;
      expect(notesBefore.length).toBeGreaterThan(0);

      await expect(seed()).rejects.toMatchObject({ code: 1 });
      expect((await ownerContacts()).rows).toEqual(before);
      expect((await ownerNotes()).rows).toEqual(notesBefore);
      await seed("--reset");
      const after = (await ownerContacts()).rows;
      expect(after).toHaveLength(1000);
      expect(after[0].id).toBeGreaterThan(before.at(-1)?.id);
      expect((await ownerNotes()).rows[0].id).toBeGreaterThan(notesBefore.at(-1)?.id);
      expect((await pool.query("select * from contacts where owner_id = 'other'")).rows).toEqual([
        otherContact,
      ]);
      expect(
        (await pool.query("select * from notes where contact_id = $1", [otherContact.id])).rows,
      ).toEqual([otherNote]);
      expect((await pool.query("select * from groups where owner_id = 'other'")).rows).toEqual([
        otherGroup,
      ]);
      expect(
        (await pool.query("select * from contact_groups where owner_id = 'other'")).rows,
      ).toEqual([{ contact_id: otherContact.id, group_id: otherGroup.id, owner_id: "other" }]);
    } finally {
      await rmdir(directory);
      await database.close();
    }
  },
);
