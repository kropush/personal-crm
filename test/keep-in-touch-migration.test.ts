import { expect, it } from "vitest";

import { migrateThrough, openTestDatabase, testPostgresPort } from "./database";

it.runIf(testPostgresPort > 0)("preserves existing contacts and notes and leaves their reminders unset", async () => {
  const database = await openTestDatabase();
  const { db, pool } = database;

  try {
    await migrateThrough(db, "0000_init");
    const seededContacts = await pool.query(
      `INSERT INTO contacts (name, about, how_we_met, phone, email)
      VALUES
        ('Anna', 'Friend', 'Tennis', '+70000000000', 'anna@example.com'),
        ('Boris', NULL, NULL, NULL, NULL)
      RETURNING *`,
    );
    const seededNotes = await pool.query(
      "INSERT INTO notes (contact_id, body) VALUES ($1, $2) RETURNING *",
      [seededContacts.rows[0].id, "Played tennis"],
    );

    await migrateThrough(db, "0001_keep_in_touch");

    expect((await pool.query("SELECT * FROM contacts ORDER BY id")).rows).toEqual(
      seededContacts.rows.map((contact) => ({
        ...contact,
        keep_in_touch_frequency: null,
        keep_in_touch_set_at: null,
        last_contacted_at: null,
      })),
    );
    expect((await pool.query("SELECT * FROM notes")).rows).toEqual(seededNotes.rows);
  } finally {
    await database.close();
  }
});
