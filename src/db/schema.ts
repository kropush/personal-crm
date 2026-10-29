import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { KEEP_IN_TOUCH_FREQUENCIES } from "./keep-in-touch";

export const keepInTouchFrequency = pgEnum(
  "keep_in_touch_frequency",
  KEEP_IN_TOUCH_FREQUENCIES,
);

export const contacts = pgTable(
  "contacts",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    // Who this person is: occupation, role in my life
    about: text(),
    // Where we know each other from
    howWeMet: text("how_we_met"),
    phone: text(),
    email: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    keepInTouchFrequency: keepInTouchFrequency("keep_in_touch_frequency"),
    // When the frequency was chosen last: the countdown starts here
    // while there are no notes and no "contacted" mark yet
    keepInTouchSetAt: timestamp("keep_in_touch_set_at", { withTimezone: true }),
    // The latest "contacted" mark; earlier ones are not kept
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "contacts_keep_in_touch_set_at_check",
      sql`(${table.keepInTouchFrequency} is null) = (${table.keepInTouchSetAt} is null)`,
    ),
  ],
);

// A note is written after a conversation: what we talked about and agreed on
export const notes = pgTable(
  "notes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notes_contact_id_idx").on(table.contactId)],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
