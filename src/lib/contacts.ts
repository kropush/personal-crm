import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { contacts, notes, type NewContact } from "@/db/schema";

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

export async function addNote(contactId: number, body: string) {
  await getDb().insert(notes).values({ contactId, body });
}
