import { describe, expect, it, vi } from "vitest";

import {
  addNoteAction,
  createContactAction,
  deleteContactAction,
  markContactedAction,
  setKeepInTouchFrequencyAction,
  undoMarkContactedAction,
  updateContactAction,
} from "@/app/actions";
import {
  addGroupMemberAction,
  deleteGroupAction,
  removeGroupMemberAction,
  renameGroupAction,
} from "@/app/groups/actions";
import { migrateDatabase } from "@/db/migrations";
import type { ContactFormState } from "@/lib/validation";

import { openTestDatabase, testPostgresPort } from "./database";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => database.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireUser: () => {
    if (!ownerId) throw new Error("Redirect to login");
    return { id: ownerId };
  },
}));

let database: Awaited<ReturnType<typeof openTestDatabase>>;
let ownerId: string | undefined;
const contactState: ContactFormState = {
  values: {
    name: "",
    about: "",
    howWeMet: "",
    phone: "",
    email: "",
    groupIds: [],
    newGroupName: "",
    newGroupNames: [],
  },
  fieldErrors: {},
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe.runIf(testPostgresPort > 0)("contact ownership in server actions", () => {
  it("rejects logged-out submissions before writing and forbids changes to another person's data", async () => {
    database = await openTestDatabase();
    const { pool } = database;
    try {
      await migrateDatabase(pool);
      await pool.query(
        `insert into "user" (id, name, email) values ('a', '', 'a@example.com'), ('b', '', 'b@example.com')`,
      );
      const {
        rows: [a, b],
      } = await pool.query(`
        insert into contacts (owner_id, name, keep_in_touch_frequency, keep_in_touch_set_at, last_contacted_at)
        values ('a', 'Contact A', 'week', '2026-01-01', '2026-01-02'), ('b', 'Contact B', 'week', '2026-01-01', '2026-01-02')
        returning *
      `);
      const {
        rows: [aGroup, bGroup],
      } = await pool.query(
        "insert into groups (owner_id, name) values ('a', 'Друзья'), ('b', 'Друзья') returning *",
      );
      const {
        rows: [aNote],
      } = await pool.query(
        "insert into notes (contact_id, body) values ($1, 'Original note') returning *",
        [a.id],
      );
      const { rows: memberships } = await pool.query(
        "insert into contact_groups (contact_id, group_id, owner_id) values ($1, $2, 'a'), ($3, $4, 'b') returning *",
        [a.id, aGroup.id, b.id, bGroup.id],
      );
      const contactForm = form({ name: "Changed" });
      const noteForm = form({ body: "New note" });
      const groupForm = form({ name: "Renamed" });
      ownerId = undefined;
      await expect(createContactAction(contactState, contactForm)).rejects.toThrow(
        "Redirect to login",
      );
      await expect(addNoteAction(a.id, { body: "", savedCount: 0 }, noteForm)).rejects.toThrow(
        "Redirect to login",
      );

      ownerId = "b";
      expect(await updateContactAction(a.id, contactState, contactForm)).toMatchObject({
        formError: "Контакт не найден",
      });
      expect(await deleteContactAction(a.id)).toEqual({ error: "Контакт не найден" });
      expect(await addNoteAction(a.id, { body: "", savedCount: 0 }, noteForm)).toMatchObject({
        error: "Контакт не найден",
      });
      expect(await setKeepInTouchFrequencyAction(a.id, "month")).toEqual({
        error: "Контакт не найден",
      });
      expect(await markContactedAction(a.id)).toEqual({ error: "Контакт не найден" });
      expect(
        await undoMarkContactedAction(a.id, a.last_contacted_at.toISOString(), null),
      ).toHaveProperty("error");

      expect(await renameGroupAction(aGroup.id, { name: "" }, groupForm)).toMatchObject({
        error: "Группа не найдена",
      });
      expect(await deleteGroupAction(aGroup.id, {}, form({ confirmation: "delete" }))).toEqual({
        error: "Группа не найдена",
      });
      expect(await removeGroupMemberAction(aGroup.id, a.id)).toHaveProperty("error");
      expect(await addGroupMemberAction(aGroup.id, b.id)).toHaveProperty("error");
      expect(await addGroupMemberAction(bGroup.id, a.id)).toHaveProperty("error");
      expect(
        await updateContactAction(
          b.id,
          contactState,
          form({ name: "Changed", groupIds: String(aGroup.id) }),
        ),
      ).toMatchObject({ fieldErrors: { groupIds: expect.any(String) } });
      await expect(
        pool.query(
          "insert into contact_groups (contact_id, group_id, owner_id) values ($1, $2, 'a')",
          [a.id, bGroup.id],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        pool.query(
          "insert into contact_groups (contact_id, group_id, owner_id) values ($1, $2, 'b')",
          [a.id, bGroup.id],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      expect((await pool.query("select * from contacts order by id")).rows).toEqual([a, b]);
      expect((await pool.query("select * from notes")).rows).toEqual([aNote]);
      expect((await pool.query("select * from groups order by id")).rows).toEqual([aGroup, bGroup]);
      expect((await pool.query("select * from contact_groups order by contact_id")).rows).toEqual(
        memberships,
      );

      expect(await addNoteAction(b.id, { body: "", savedCount: 0 }, noteForm)).toMatchObject({
        savedCount: 1,
      });
      expect(await renameGroupAction(bGroup.id, { name: "" }, groupForm)).toEqual({
        name: "Renamed",
      });
      expect(await setKeepInTouchFrequencyAction(b.id, "month")).toEqual({});
    } finally {
      await database.close();
    }
  });
});
