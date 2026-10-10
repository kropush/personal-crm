import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contacts = pgTable("contacts", {
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
});

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
