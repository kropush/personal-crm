import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { contactGroups, contacts, groups } from "@/db/schema";
import { firstValue } from "@/lib/search-params";
import { parseRecordId } from "@/lib/validation";

export async function listGroups() {
  return getDb()
    .select()
    .from(groups)
    .orderBy(asc(groups.name), asc(groups.id));
}

export async function createGroup(name: string) {
  await getDb().insert(groups).values({ name });
}

export const getGroup = cache(async (id: number) => {
  const [group] = await getDb().select().from(groups).where(eq(groups.id, id));
  return group;
});

export async function getContactFilterGroup(value: string | string[] | undefined) {
  const id = parseRecordId(firstValue(value));
  return id === null ? undefined : getGroup(id);
}

export async function getContactGroups(contactId: number) {
  return getDb()
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(contactGroups.groupId, groups.id))
    .where(eq(contactGroups.contactId, contactId))
    .orderBy(asc(groups.name), asc(groups.id));
}

export async function renameGroup(id: number, name: string) {
  const [updated] = await getDb()
    .update(groups)
    .set({ name })
    .where(eq(groups.id, id))
    .returning({ id: groups.id });
  return Boolean(updated);
}

export async function deleteGroup(id: number) {
  await getDb().delete(groups).where(eq(groups.id, id));
}

export async function setGroupMember(groupId: number, contactId: number, isMember: boolean) {
  return getDb().transaction(async (tx) => {
    // Take the same contact lock as the contact form before changing its groups.
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .for("no key update");
    if (!contact) return false;

    if (isMember) {
      await tx.insert(contactGroups).values({ groupId, contactId }).onConflictDoNothing();
    } else {
      await tx.delete(contactGroups).where(
        and(eq(contactGroups.groupId, groupId), eq(contactGroups.contactId, contactId)),
      );
    }
    return true;
  });
}
