import { eq, sql, TransactionRollbackError } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { contacts, type NewContact, notes } from "@/db/schema";
import {
  addNote,
  createContact,
  findContactsToReachOut,
  getKeepInTouchStatus,
  getNotes,
  markContacted,
  setKeepInTouchFrequency,
  undoMarkContacted,
} from "@/lib/contacts";

import { openTestDatabase, testPostgresPort } from "./database";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => transaction }));

type TestDatabase = Awaited<ReturnType<typeof openTestDatabase>>;
type TestTransaction = Parameters<Parameters<TestDatabase["db"]["transaction"]>[0]>[0];

let database: TestDatabase;
let transaction: TestTransaction;

async function seedContact(values: Omit<NewContact, "name"> & { name?: string }) {
  const [contact] = await transaction
    .insert(contacts)
    .values({ name: "Reminder Contact", ...values })
    .returning();
  return contact.id;
}

function withDatabase(test: (day: (offset: number) => Date) => Promise<void>) {
  return async () => {
    try {
      await database.db.transaction(async (tx) => {
        transaction = tx;
        await tx.execute(sql`set local time zone 'UTC'`);
        const { rows: [{ today }] } = await tx.execute<{ today: string }>(
          sql`select to_char(now() at time zone 'Europe/Moscow', 'YYYY-MM-DD') as today`,
        );
        const day = (offset: number) => {
          const result = new Date(`${today}T12:00:00Z`);
          result.setUTCDate(result.getUTCDate() + offset);
          return result;
        };
        await test(day);
        tx.rollback();
      });
    } catch (error) {
      if (!(error instanceof TransactionRollbackError)) throw error;
    }
  };
}

function calendarDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe.runIf(testPostgresPort > 0)("keep-in-touch database rules", () => {
  beforeAll(async () => {
    database = await openTestDatabase();
    await migrate(database.db, { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await database?.close();
  });

  it("starts a new contact with no frequency, deadline or reminder", withDatabase(async () => {
    const id = await createContact(
      { name: "New Contact", about: null, howWeMet: null, phone: null, email: null },
      { groupIds: [], newGroupNames: [] },
    );

    expect(await getKeepInTouchStatus(id)).toMatchObject({
      frequency: null,
      dueDate: null,
      overdueDays: null,
    });
    expect(await findContactsToReachOut()).toEqual([]);
  }));

  it.each([
    ["week", "2026-10-28T12:00:00Z", "2026-11-04"],
    ["month", "2026-10-28T12:00:00Z", "2026-11-28"],
    ["month", "2027-01-31T12:00:00Z", "2027-02-28"],
    ["month", "2028-01-31T12:00:00Z", "2028-02-29"],
    ["quarter", "2026-10-28T12:00:00Z", "2027-01-28"],
    ["year", "2026-10-28T12:00:00Z", "2027-10-28"],
  ] as const)("uses the %s calendar period from selection on %s", (frequency, selectedAt, dueDate) =>
    withDatabase(async () => {
      const id = await seedContact({
        keepInTouchFrequency: frequency,
        keepInTouchSetAt: new Date(selectedAt),
      });

      expect(await getKeepInTouchStatus(id)).toMatchObject({ frequency, dueDate });
    })(),
  );

  it("restarts the fallback date only when the frequency changes and clears it when unset", withDatabase(async (day) => {
    const id = await seedContact({
      keepInTouchFrequency: "month",
      keepInTouchSetAt: day(-60),
    });
    const originalStatus = await getKeepInTouchStatus(id);
    expect(await findContactsToReachOut()).toMatchObject([{ id }]);

    expect(await setKeepInTouchFrequency(id, "month")).toBe(true);
    expect(await getKeepInTouchStatus(id)).toEqual(originalStatus);

    expect(await setKeepInTouchFrequency(id, "quarter")).toBe(true);
    const expectedQuarter = day(0);
    expectedQuarter.setUTCDate(1);
    expectedQuarter.setUTCMonth(expectedQuarter.getUTCMonth() + 3);
    const endOfMonth = new Date(expectedQuarter);
    endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
    expectedQuarter.setUTCDate(Math.min(day(0).getUTCDate(), endOfMonth.getUTCDate()));
    expect(await getKeepInTouchStatus(id)).toMatchObject({
      frequency: "quarter",
      dueDate: calendarDate(expectedQuarter),
    });
    expect(await findContactsToReachOut()).toEqual([]);

    expect(await setKeepInTouchFrequency(id, null)).toBe(true);
    expect(await getKeepInTouchStatus(id)).toMatchObject({
      frequency: null,
      dueDate: null,
      overdueDays: null,
    });
    const [contact] = await transaction.select().from(contacts).where(eq(contacts.id, id));
    expect(contact.keepInTouchSetAt).toBeNull();
  }));

  it("uses the latest note instead of an older mark or the new frequency selection", withDatabase(async (day) => {
    const id = await seedContact({ lastContactedAt: day(-5) });
    await transaction.insert(notes).values([
      { contactId: id, body: "Latest note", createdAt: day(-3) },
      { contactId: id, body: "Older note inserted later", createdAt: day(-20) },
    ]);

    await setKeepInTouchFrequency(id, "week");

    expect(await getKeepInTouchStatus(id)).toMatchObject({
      dueDate: calendarDate(day(4)),
      overdueDays: -4,
    });
    expect(await findContactsToReachOut()).toEqual([]);
  }));

  it("uses a later contacted mark instead of the last note", withDatabase(async (day) => {
    const id = await seedContact({
      keepInTouchFrequency: "week",
      keepInTouchSetAt: day(-1),
      lastContactedAt: day(-3),
    });
    await transaction.insert(notes).values({
      contactId: id, body: "Previous conversation", createdAt: day(-20),
    });

    expect(await getKeepInTouchStatus(id)).toMatchObject({
      dueDate: calendarDate(day(4)),
      overdueDays: -4,
    });
  }));

  it("recalculates a new frequency from the same note and removes reminders when it is unset", withDatabase(async (day) => {
    const id = await seedContact({ keepInTouchFrequency: "month", keepInTouchSetAt: day(-3) });
    await transaction.insert(notes).values({
      contactId: id, body: "Conversation before the frequency change", createdAt: day(-18),
    });
    expect(await findContactsToReachOut()).toEqual([]);

    await setKeepInTouchFrequency(id, "week");
    expect(await getKeepInTouchStatus(id)).toMatchObject({
      dueDate: calendarDate(day(-11)),
      overdueDays: 11,
    });
    expect(await findContactsToReachOut()).toMatchObject([{ id, overdueDays: 11 }]);

    await setKeepInTouchFrequency(id, null);
    expect(await getKeepInTouchStatus(id)).toMatchObject({ dueDate: null });
    expect(await findContactsToReachOut()).toEqual([]);
  }));

  it("uses notes saved after Moscow midnight as the next day in a UTC session", withDatabase(async () => {
    const id = await seedContact({
      keepInTouchFrequency: "week",
      keepInTouchSetAt: new Date("2026-10-27T12:00:00Z"),
    });
    const note = { contactId: id, body: "Late conversation" };

    await transaction.insert(notes).values({ ...note, createdAt: new Date("2026-10-28T20:59:00Z") });
    expect(await getKeepInTouchStatus(id)).toMatchObject({ dueDate: "2026-11-04" });

    await transaction.insert(notes).values({ ...note, createdAt: new Date("2026-10-28T21:30:00Z") });
    expect(await getKeepInTouchStatus(id)).toMatchObject({ dueDate: "2026-11-05" });
  }));

  it("returns due and overdue contacts in deadline order with ties by name", withDatabase(async (day) => {
    const examples = [
      { name: "Vera", noteDaysAgo: 7, overdueDays: 0 },
      { name: "Boris", noteDaysAgo: 10, overdueDays: 3 },
      { name: "Anna", noteDaysAgo: 47, overdueDays: 40 },
      { name: "Alina", noteDaysAgo: 10, overdueDays: 3 },
      { name: "Tomorrow", noteDaysAgo: 6, overdueDays: -1 },
      { name: "One Day Late", noteDaysAgo: 8, overdueDays: 1 },
    ];
    for (const { name, noteDaysAgo, overdueDays } of examples) {
      const id = await seedContact({ name, keepInTouchFrequency: "week", keepInTouchSetAt: day(-1) });
      await transaction.insert(notes).values({
        contactId: id, body: "Conversation", createdAt: day(-noteDaysAgo),
      });
      expect(await getKeepInTouchStatus(id)).toMatchObject({
        dueDate: calendarDate(day(-overdueDays)),
        overdueDays,
      });
    }
    await seedContact({ name: "No Frequency" });

    expect((await findContactsToReachOut()).map(({ name, overdueDays }) => [name, overdueDays])).toEqual([
      ["Anna", 40], ["Alina", 3], ["Boris", 3], ["One Day Late", 1], ["Vera", 0],
    ]);
  }));

  it("restarts an overdue reminder only for contacts with a frequency when a note is saved", withDatabase(async (day) => {
    const overdue = await seedContact({ keepInTouchFrequency: "week", keepInTouchSetAt: day(-8) });
    const unset = await seedContact({ name: "No Schedule" });
    expect(await findContactsToReachOut()).toMatchObject([{ id: overdue, overdueDays: 1 }]);

    await addNote(overdue, "New conversation");
    await addNote(unset, "Conversation without a schedule");

    expect(await getKeepInTouchStatus(overdue)).toMatchObject({
      dueDate: calendarDate(day(7)),
      overdueDays: -7,
    });
    expect(await getKeepInTouchStatus(unset)).toMatchObject({ frequency: null, dueDate: null });
    expect(await getNotes(unset)).toMatchObject([{ body: "Conversation without a schedule" }]);
    expect(await findContactsToReachOut()).toEqual([]);
  }));

  it.each([
    ["overdue", -19, -8, 1],
    ["before it is due", -19, -6, -1],
    ["without a previous mark", -8, null, 1],
  ] as const)("restarts the deadline when marked %s and restores it on undo", (_, noteOffset, markOffset, originalOverdue) =>
    withDatabase(async (day) => {
      const previous = markOffset === null ? null : day(markOffset);
      const id = await seedContact({
        keepInTouchFrequency: "week",
        keepInTouchSetAt: day(-20),
        lastContactedAt: previous,
      });
      await transaction.insert(notes).values({
        contactId: id, body: "Previous conversation", createdAt: day(noteOffset),
      });
      const originalStatus = await getKeepInTouchStatus(id);
      const originalNotes = await getNotes(id);
      expect(originalStatus?.overdueDays).toBe(originalOverdue);

      const mark = await markContacted(id);
      expect(mark.previous).toEqual(previous);
      expect(await getKeepInTouchStatus(id)).toMatchObject({
        dueDate: calendarDate(day(7)),
        overdueDays: -7,
      });
      expect(await getNotes(id)).toEqual(originalNotes);
      expect(await findContactsToReachOut()).toEqual([]);

      expect(await undoMarkContacted(id, mark.markedAt, mark.previous)).toBe(true);
      expect(await getKeepInTouchStatus(id)).toEqual(originalStatus);
    })(),
  );

  it("keeps a newer contacted mark when asked to undo an older one", withDatabase(async (day) => {
    const id = await seedContact({ keepInTouchFrequency: "week", keepInTouchSetAt: day(-15) });
    const mark = await markContacted(id);
    const newerMark = new Date(mark.markedAt.getTime() + 1);
    await transaction.update(contacts).set({ lastContactedAt: newerMark }).where(eq(contacts.id, id));

    expect(await undoMarkContacted(id, mark.markedAt, mark.previous)).toBe(false);
    const [contact] = await transaction.select().from(contacts).where(eq(contacts.id, id));
    expect(contact.lastContactedAt).toEqual(newerMark);
  }));
});
