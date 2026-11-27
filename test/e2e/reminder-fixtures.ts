import { test as base } from "@playwright/test";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig } from "../../src/db/config";
import {
  contactGroups,
  contacts,
  groups,
  type Contact,
  type NewContact,
} from "../../src/db/schema";

import { e2eOwner } from "./fixtures";

type ReminderData = {
  addContacts(values: Omit<NewContact, "ownerId">[]): Promise<Contact[]>;
  addGroup(name: string, members: Contact[]): Promise<void>;
};

export const test = base.extend<{ reminderData: ReminderData }>({
  reminderData: async ({}, runTest) => {
    const pool = new Pool(getDatabaseConfig());
    const db = drizzle({ client: pool });
    const contactIds: number[] = [];
    const groupIds: number[] = [];

    try {
      await runTest({
        async addContacts(values) {
          const added = await db
            .insert(contacts)
            .values(values.map((value) => ({ ...value, ownerId: e2eOwner.id })))
            .returning();
          contactIds.push(...added.map(({ id }) => id));
          return added;
        },
        async addGroup(name, members) {
          const [group] = await db
            .insert(groups)
            .values({ name, ownerId: e2eOwner.id })
            .returning();
          groupIds.push(group.id);
          await db.insert(contactGroups).values(
            members.map((contact) => ({
              contactId: contact.id,
              groupId: group.id,
              ownerId: e2eOwner.id,
            })),
          );
        },
      });
    } finally {
      try {
        if (contactIds.length) await db.delete(contacts).where(inArray(contacts.id, contactIds));
        if (groupIds.length) await db.delete(groups).where(inArray(groups.id, groupIds));
      } finally {
        await pool.end();
      }
    }
  },
});
