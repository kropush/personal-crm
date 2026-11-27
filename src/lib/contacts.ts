import "server-only";

import { and, asc, desc, eq, exists, inArray, isNotNull, not, sql, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import type { KeepInTouchFrequency } from "@/db/keep-in-touch";
import { contactGroups, contacts, groups, notes, type NewContact } from "@/db/schema";
import { describeError } from "@/lib/loggable-error";
import { APP_TIME_ZONE } from "@/lib/time-zone";

const MAX_SEARCH_LENGTH = 100;
const MAX_SEARCH_WORDS = 5;

// Lowercases and folds "ё" into "е", so that "семен" finds "Семён"
function normalizeForSearch(value: string) {
  return value.toLowerCase().replaceAll("ё", "е");
}

// Makes %, _ and \ match literally inside a LIKE pattern
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function belongsToGroup(db: ReturnType<typeof getDb>, groupId: number) {
  return exists(
    db
      .select({ groupId: contactGroups.groupId })
      .from(contactGroups)
      .where(and(eq(contactGroups.contactId, contacts.id), eq(contactGroups.groupId, groupId))),
  );
}

export async function findContactsByName(
  search: string,
  membership?: { groupId: number; exclude?: boolean },
) {
  const words = normalizeForSearch(search.slice(0, MAX_SEARCH_LENGTH))
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_WORDS);

  const normalizedName = sql`translate(lower(${contacts.name}), 'ё', 'е')`;

  const contains = (word: string) => sql`${normalizedName} like ${`%${escapeLikePattern(word)}%`}`;

  const startsSomeWord = (word: string) => {
    const pattern = escapeLikePattern(word);
    return sql`(${normalizedName} like ${`${pattern}%`} or ${normalizedName} like ${`% ${pattern}%`} or ${normalizedName} like ${`%-${pattern}%`})`;
  };

  // Every word must occur in the name, in any order:
  // "петров иван" finds "Иван Петров". No words means no filter.
  const matchesEveryWord = and(...words.map(contains));
  // Names where the search words begin a word go first:
  // "лев" lists Лев and Левин before Королёв.
  const bestMatchesFirst =
    words.length > 0 ? [sql`case when ${and(...words.map(startsSomeWord))} then 0 else 1 end`] : [];

  try {
    const db = getDb();
    let membershipCondition;
    if (membership) {
      const inGroup = belongsToGroup(db, membership.groupId);
      membershipCondition = membership.exclude ? not(inGroup) : inGroup;
    }

    const groupNames = db
      .select({ name: groups.name })
      .from(contactGroups)
      .innerJoin(groups, eq(contactGroups.groupId, groups.id))
      .where(eq(contactGroups.contactId, contacts.id))
      .orderBy(asc(groups.name), asc(groups.id));

    return await db
      .select({
        id: contacts.id,
        name: contacts.name,
        about: contacts.about,
        phone: contacts.phone,
        email: contacts.email,
        groupNames: sql<string[]>`array(${groupNames})`,
      })
      .from(contacts)
      .where(and(matchesEveryWord, membershipCondition))
      .orderBy(...bestMatchesFirst, asc(contacts.name), asc(contacts.id));
  } catch (error) {
    // Next.js logs an error thrown while rendering a page. The original one
    // carries the search words, which are parts of names: see loggable-error.ts
    throw new Error("Failed to search contacts", {
      cause: describeError(error),
    });
  }
}

export type ContactListItem = Awaited<ReturnType<typeof findContactsByName>>[number];

export async function countContacts(groupId?: number) {
  const db = getDb();
  return db.$count(contacts, groupId === undefined ? undefined : belongsToGroup(db, groupId));
}

// Wrapped in cache() so the page and its metadata share one query per request
export const getContact = cache(async (id: number) => {
  const [contact] = await getDb().select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return contact;
});

export async function getNotes(contactId: number) {
  return getDb()
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

type ContactDetails = Pick<NewContact, "name" | "about" | "howWeMet" | "phone" | "email">;

type TransactionCallback = Parameters<ReturnType<typeof getDb>["transaction"]>[0];
type ContactTransaction = Parameters<TransactionCallback>[0];

export type ContactGroupSelection = {
  groupIds: number[];
  newGroupNames: string[];
};

export class ContactGroupsChangedError extends Error {}

async function replaceContactGroups(
  tx: ContactTransaction,
  contactId: number,
  { groupIds, newGroupNames }: ContactGroupSelection,
) {
  if (groupIds.length) {
    // Lock selected groups before touching links so deletion cannot race a save.
    const selected = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(inArray(groups.id, groupIds))
      .orderBy(asc(groups.id))
      .for("key share");
    if (selected.length !== groupIds.length) {
      throw new ContactGroupsChangedError("A selected group no longer exists");
    }
  }

  const created = newGroupNames.length
    ? await tx
        .insert(groups)
        .values(newGroupNames.map((name) => ({ name })))
        .returning({ id: groups.id })
    : [];
  const selectedIds = [...groupIds, ...created.map((group) => group.id)];
  await tx.delete(contactGroups).where(eq(contactGroups.contactId, contactId));
  if (selectedIds.length) {
    await tx.insert(contactGroups).values(selectedIds.map((groupId) => ({ contactId, groupId })));
  }
}

export async function createContact(values: ContactDetails, selection: ContactGroupSelection) {
  return getDb().transaction(async (tx) => {
    const [created] = await tx.insert(contacts).values(values).returning({ id: contacts.id });
    if (selection.groupIds.length || selection.newGroupNames.length) {
      await replaceContactGroups(tx, created.id, selection);
    }
    return created.id;
  });
}

// Returns false when there is no contact with this id
export async function updateContact(
  id: number,
  values: ContactDetails,
  selection: ContactGroupSelection,
) {
  return getDb().transaction(async (tx) => {
    // Concurrent edits of the same contact take this row lock before editing links.
    const [updated] = await tx
      .update(contacts)
      .set(values)
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    if (!updated) return false;

    await replaceContactGroups(tx, id, selection);
    return true;
  });
}

// Its notes are deleted too: the foreign key cascades
export async function deleteContact(id: number) {
  await getDb().delete(contacts).where(eq(contacts.id, id));
}

export async function addNote(contactId: number, body: string) {
  await getDb().insert(notes).values({ contactId, body });
}

// --- Keep in touch ----------------------------------------------------------
//
// Due dates are counted here, in the database, for the card and for the home
// page alike: one "now" for the whole query, days in Moscow time.

const FREQUENCY_INTERVALS: Record<KeepInTouchFrequency, string> = {
  week: "7 days",
  month: "1 month",
  quarter: "3 months",
  year: "1 year",
};

// Uses the notes_contact_id_idx index
const lastNoteAt = sql`(select max(${notes.createdAt}) from ${notes} where ${notes.contactId} = ${contacts.id})`;

// The day of the last conversation: a note or a "contacted" mark, whichever is
// later (greatest() skips nulls). Without either, the day the frequency was chosen.
const countdownStart = sql`(coalesce(greatest(${lastNoteAt}, ${contacts.lastContactedAt}), ${contacts.keepInTouchSetAt}) at time zone ${APP_TIME_ZONE})::date`;

const frequencyInterval = sql`(case ${contacts.keepInTouchFrequency} ${sql.join(
  Object.entries(FREQUENCY_INTERVALS).map(
    ([frequency, interval]) => sql`when ${frequency} then ${interval}::interval`,
  ),
  sql` `,
)} end)`;

// Calendar periods: Postgres moves 31 January + 1 month to the end of February.
// Null when no frequency is set.
const dueDate = sql`(${countdownStart} + ${frequencyInterval})::date`;

const today = sql`(now() at time zone ${APP_TIME_ZONE})::date`;

// 0 on the due date, negative while it is ahead
const overdueDays = sql<number>`(${today} - ${dueDate})`;

// For the card. dueDate is a "YYYY-MM-DD" day in Moscow; currentYear tells
// whether to print the year. Undefined when there is no contact with this id.
export async function getKeepInTouchStatus(contactId: number) {
  const [status] = await getDb()
    .select({
      frequency: contacts.keepInTouchFrequency,
      dueDate: sql<string | null>`to_char(${dueDate}, 'YYYY-MM-DD')`,
      overdueDays: sql<number | null>`${overdueDays}`,
      currentYear: sql<number>`extract(year from ${today})::int`,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return status;
}

export type KeepInTouchStatus = NonNullable<Awaited<ReturnType<typeof getKeepInTouchStatus>>>;

// Entries due today or earlier, from the selected group when supplied.
export async function findContactsToReachOut(groupId?: number) {
  const db = getDb();
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      frequency: sql<KeepInTouchFrequency>`${contacts.keepInTouchFrequency}`,
      overdueDays,
    })
    .from(contacts)
    .where(
      and(
        isNotNull(contacts.keepInTouchFrequency),
        sql`${overdueDays} >= 0`,
        groupId === undefined ? undefined : belongsToGroup(db, groupId),
      ),
    )
    .orderBy(asc(dueDate), asc(contacts.name), asc(contacts.id));
}

export type ReachOutItem = Awaited<ReturnType<typeof findContactsToReachOut>>[number];

// Returns false when there is no contact with this id. null is "Не задано".
export async function setKeepInTouchFrequency(
  contactId: number,
  frequency: KeepInTouchFrequency | null,
) {
  const updated = await getDb()
    .update(contacts)
    .set({
      keepInTouchFrequency: frequency,
      // Choosing the frequency that is already set does not restart the countdown
      keepInTouchSetAt:
        frequency === null
          ? null
          : sql`case when ${contacts.keepInTouchFrequency} = ${frequency} then ${contacts.keepInTouchSetAt} else now() end`,
    })
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });
  return updated.length > 0;
}

// Saves "contacted today" and returns the new mark and the one it replaced,
// so that the mark can be undone. Undefined when there is no contact with this id.
export async function markContacted(contactId: number) {
  const [marked] = await getDb()
    .update(contacts)
    // Milliseconds only: the moment travels to the browser as a JS Date and
    // back, and the undo looks for exactly this value
    .set({ lastContactedAt: sql`date_trunc('milliseconds', now())` })
    .where(eq(contacts.id, contactId))
    // old. and new. in RETURNING need Postgres 18
    .returning({
      markedAt: sql`new.last_contacted_at`.mapWith(contacts.lastContactedAt),
      previous: sql`old.last_contacted_at`.mapWith(contacts.lastContactedAt) as SQL<Date | null>,
    });
  return marked;
}

// Puts back the mark that markContacted() replaced, but only while the field
// still holds `markedAt`: a newer mark from another browser stays.
// Returns false when nothing was put back.
export async function undoMarkContacted(contactId: number, markedAt: Date, previous: Date | null) {
  const restored = await getDb()
    .update(contacts)
    .set({ lastContactedAt: previous })
    .where(and(eq(contacts.id, contactId), eq(contacts.lastContactedAt, markedAt)))
    .returning({ id: contacts.id });
  return restored.length > 0;
}
