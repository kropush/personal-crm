import "server-only";

import { and, asc, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import type { KeepInTouchFrequency } from "@/db/keep-in-touch";
import { contacts, notes, type NewContact } from "@/db/schema";
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

export async function findContactsByName(search: string) {
  const words = normalizeForSearch(search.slice(0, MAX_SEARCH_LENGTH))
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_WORDS);

  const normalizedName = sql`translate(lower(${contacts.name}), 'ё', 'е')`;

  const contains = (word: string) =>
    sql`${normalizedName} like ${`%${escapeLikePattern(word)}%`}`;

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
    words.length > 0
      ? [sql`case when ${and(...words.map(startsSomeWord))} then 0 else 1 end`]
      : [];

  return getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(matchesEveryWord)
    .orderBy(...bestMatchesFirst, asc(contacts.name), asc(contacts.id));
}

export type ContactListItem = Awaited<
  ReturnType<typeof findContactsByName>
>[number];

export async function countContacts() {
  return getDb().$count(contacts);
}

// Wrapped in cache() so the page and its metadata share one query per request
export const getContact = cache(async (id: number) => {
  const [contact] = await getDb()
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact;
});

export async function getNotes(contactId: number) {
  return getDb()
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

type ContactDetails = Pick<
  NewContact,
  "name" | "about" | "howWeMet" | "phone" | "email"
>;

export async function createContact(values: ContactDetails) {
  const [created] = await getDb()
    .insert(contacts)
    .values(values)
    .returning({ id: contacts.id });
  return created.id;
}

// Returns false when there is no contact with this id
export async function updateContact(id: number, values: ContactDetails) {
  const updated = await getDb()
    .update(contacts)
    .set(values)
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length > 0;
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

export type KeepInTouchStatus = NonNullable<
  Awaited<ReturnType<typeof getKeepInTouchStatus>>
>;

// For the "Пора связаться" block: everyone whose due date is today or past,
// the most overdue first
export async function findContactsToReachOut() {
  return getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      frequency: sql<KeepInTouchFrequency>`${contacts.keepInTouchFrequency}`,
      overdueDays,
    })
    .from(contacts)
    .where(
      and(isNotNull(contacts.keepInTouchFrequency), sql`${overdueDays} >= 0`),
    )
    .orderBy(asc(dueDate), asc(contacts.name), asc(contacts.id));
}

export type ReachOutItem = Awaited<
  ReturnType<typeof findContactsToReachOut>
>[number];

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
      previous: sql`old.last_contacted_at`.mapWith(
        contacts.lastContactedAt,
      ) as SQL<Date | null>,
    });
  return marked;
}

// Puts back the mark that markContacted() replaced, but only while the field
// still holds `markedAt`: a newer mark from another browser stays.
// Returns false when nothing was put back.
export async function undoMarkContacted(
  contactId: number,
  markedAt: Date,
  previous: Date | null,
) {
  const restored = await getDb()
    .update(contacts)
    .set({ lastContactedAt: previous })
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.lastContactedAt, markedAt),
      ),
    )
    .returning({ id: contacts.id });
  return restored.length > 0;
}
