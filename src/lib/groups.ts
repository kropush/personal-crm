import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { contactGroups, contacts, groups } from "@/db/schema";
import { firstValue } from "@/lib/search-params";
import { parseRecordId } from "@/lib/validation";

const groupFields = { id: groups.id, name: groups.name };

function ownedGroup(ownerId: string, id: number) {
  return and(eq(groups.ownerId, ownerId), eq(groups.id, id));
}

export async function listGroups(ownerId: string) {
  return getDb()
    .select(groupFields)
    .from(groups)
    .where(eq(groups.ownerId, ownerId))
    .orderBy(asc(groups.name), asc(groups.id));
}

export async function createGroup(ownerId: string, name: string) {
  await getDb().insert(groups).values({ name, ownerId });
}

export const getGroup = cache(async (ownerId: string, id: number) => {
  const [group] = await getDb().select(groupFields).from(groups).where(ownedGroup(ownerId, id));
  return group;
});

export async function getContactFilterGroup(ownerId: string, value: string | string[] | undefined) {
  const id = parseRecordId(firstValue(value));
  return id === null ? undefined : getGroup(ownerId, id);
}

export async function getContactGroups(ownerId: string, contactId: number) {
  return getDb()
    .select(groupFields)
    .from(contactGroups)
    .innerJoin(groups, eq(contactGroups.groupId, groups.id))
    .where(and(eq(contactGroups.ownerId, ownerId), eq(contactGroups.contactId, contactId)))
    .orderBy(asc(groups.name), asc(groups.id));
}

export async function renameGroup(ownerId: string, id: number, name: string) {
  const [updated] = await getDb()
    .update(groups)
    .set({ name })
    .where(ownedGroup(ownerId, id))
    .returning({ id: groups.id });
  return Boolean(updated);
}

export async function deleteGroup(ownerId: string, id: number) {
  const [deleted] = await getDb()
    .delete(groups)
    .where(ownedGroup(ownerId, id))
    .returning({ id: groups.id });
  return Boolean(deleted);
}

export async function setGroupMember(
  ownerId: string,
  groupId: number,
  contactId: number,
  isMember: boolean,
) {
  return getDb().transaction(async (tx) => {
    // Take the same contact lock as the contact form before changing its groups.
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, contactId)))
      .for("no key update");
    if (!contact) return "contact-not-found";

    const [group] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(ownedGroup(ownerId, groupId))
      .for("key share");
    if (!group) return "group-not-found";

    if (isMember) {
      await tx.insert(contactGroups).values({ groupId, contactId, ownerId }).onConflictDoNothing();
    } else {
      await tx
        .delete(contactGroups)
        .where(
          and(
            eq(contactGroups.ownerId, ownerId),
            eq(contactGroups.groupId, groupId),
            eq(contactGroups.contactId, contactId),
          ),
        );
    }
    return "updated";
  });
}
