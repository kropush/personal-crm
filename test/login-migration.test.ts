import { describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/migrations";
import { migrateThrough, openTestDatabase, testPostgresPort } from "./database";

type Database = Awaited<ReturnType<typeof openTestDatabase>>;

async function seedLegacy({ db, pool }: Database) {
  await migrateThrough(db, "0002_contact_groups");
  const { rows: contacts } = await pool.query(
    `insert into contacts
       (name, about, how_we_met, phone, email, keep_in_touch_frequency, keep_in_touch_set_at, last_contacted_at)
     values
       ('Anna', 'Friend', 'Tennis', '+70000000000', 'anna@example.com', 'month', '2026-01-01', '2026-01-17'),
       ('Boris', null, null, null, null, null, null, null)
     returning *`,
  );
  const { rows: groups } = await pool.query(
    "insert into groups (name) values ('Friends'), ('Tennis') returning *",
  );
  const { rows: notes } = await pool.query(
    "insert into notes (contact_id, body) values ($1, 'Played tennis'), ($2, 'Made plans') returning *",
    [contacts[0].id, contacts[1].id],
  );
  const { rows: memberships } = await pool.query(
    "insert into contact_groups (contact_id, group_id) values ($1, $2), ($1, $3), ($4, $2) returning *",
    [contacts[0].id, groups[0].id, groups[1].id, contacts[1].id],
  );
  return { contacts, groups, notes, memberships };
}

describe.runIf(testPostgresPort > 0)("login migration", () => {
  it("preserves all legacy rows and assigns one owner by normalized email", async () => {
    const database = await openTestDatabase();
    try {
      const { contacts, groups, notes, memberships } = await seedLegacy(database);
      await migrateDatabase(database.pool, "  Owner@Example.com  ");
      await migrateDatabase(database.pool);

      const { pool } = database;
      const users = (await pool.query('select id, email, email_verified from "user"')).rows;
      expect(users).toEqual([
        { id: expect.any(String), email: "owner@example.com", email_verified: false },
      ]);
      const ownerId = users[0].id;
      expect((await pool.query("select * from contacts order by id")).rows).toEqual(
        contacts.map((contact) => ({ ...contact, owner_id: ownerId })),
      );
      expect((await pool.query("select * from groups order by id")).rows).toEqual(
        groups.map((group) => ({ ...group, owner_id: ownerId })),
      );
      expect((await pool.query("select * from notes order by id")).rows).toEqual(notes);
      expect(
        (await pool.query("select * from contact_groups order by contact_id, group_id")).rows,
      ).toEqual(memberships.map((membership) => ({ ...membership, owner_id: ownerId })));
    } finally {
      await database.close();
    }
  });

  it("migrates an empty database without creating an account and can run again", async () => {
    const database = await openTestDatabase();
    try {
      await migrateDatabase(database.pool);
      await migrateDatabase(database.pool);
      const { pool } = database;
      expect((await pool.query('select id from "user"')).rows).toEqual([]);
      expect((await pool.query("select owner_id from contacts")).rows).toEqual([]);
      expect((await pool.query("select owner_id from groups")).rows).toEqual([]);
      expect((await pool.query("select owner_id from contact_groups")).rows).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it.each([undefined, "invalid"] as const)(
    "rolls back schema and data when the configured owner is %s",
    async (ownerEmail) => {
      const database = await openTestDatabase();
      try {
        const { contacts, groups, notes, memberships } = await seedLegacy(database);
        await expect(migrateDatabase(database.pool, ownerEmail)).rejects.toThrow(/CRM_OWNER_EMAIL/);
        const { pool } = database;
        expect((await pool.query("select to_regclass('public.user') as auth_table")).rows).toEqual([
          { auth_table: null },
        ]);
        expect((await pool.query("select * from contacts order by id")).rows).toEqual(contacts);
        expect((await pool.query("select * from groups order by id")).rows).toEqual(groups);
        expect((await pool.query("select * from notes order by id")).rows).toEqual(notes);
        expect(
          (await pool.query("select * from contact_groups order by contact_id, group_id")).rows,
        ).toEqual(memberships);
        await migrateDatabase(database.pool, "owner@example.com");
      } finally {
        await database.close();
      }
    },
  );
});
