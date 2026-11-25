import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connection } from "next/server";
import { PassThrough } from "node:stream";
import { createElement, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createContactAction, updateContactAction } from "@/app/actions";
import ContactPage from "@/app/contacts/[id]/page";
import GroupPage from "@/app/groups/[id]/page";
import GroupsPage from "@/app/groups/page";
import ContactsPage from "@/app/page";
import { addGroupMemberAction, createGroupAction, deleteGroupAction, removeGroupMemberAction, renameGroupAction } from "@/app/groups/actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";
import { ReachOutSection } from "@/components/reach-out-section";
import { getDb } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { findContactsByName, getContact, getNotes } from "@/lib/contacts";
import { getContactGroups, getGroup, listGroups } from "@/lib/groups";
import type { ContactFormState } from "@/lib/validation";

import { openTestDatabase, testPostgresPort } from "./database";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useRouter: () => ({ bfcacheId: "test" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/db", () => ({ getDb: vi.fn(() => database.db) }));

let database: Awaited<ReturnType<typeof openTestDatabase>>;

const emptyContactState: ContactFormState = {
  values: {
    name: "", about: "", howWeMet: "", phone: "", email: "", groupIds: [],
    newGroupName: "", newGroupNames: [],
  },
  fieldErrors: {},
};

function contactForm(name: string, groupIds: number[]) {
  const form = new FormData();
  form.set("name", name);
  for (const id of groupIds) form.append("groupIds", String(id));
  return form;
}

function groupNameForm(name: string) {
  const form = new FormData();
  form.set("name", name);
  return form;
}

async function seedGroup(name: string) {
  const [group] = await database.db.insert(groups).values({ name }).returning();
  return group;
}

async function seedContact(name: string) {
  const [contact] = await database.db.insert(contacts).values({ name }).returning();
  return contact;
}

function renderView(view: ReactNode) {
  return new Promise<string>((resolve, reject) => {
    const body = new PassThrough();
    body.setEncoding("utf8");
    let html = "";
    body.on("data", (chunk) => { html += chunk; });
    body.on("end", () => resolve(html));
    body.on("error", reject);
    const stream = renderToPipeableStream(view, {
      onAllReady: () => stream.pipe(body),
      onError: reject,
    });
  });
}

function renderGroupPage(groupId: number, query?: string) {
  return renderView(createElement(GroupPage, {
    params: Promise.resolve({ id: String(groupId) }),
    searchParams: Promise.resolve({ q: query }),
  }));
}

function renderReminders(groupId?: number, q?: string) {
  return renderView(createElement(ReachOutSection, {
    searchParams: Promise.resolve({ group: groupId?.toString(), q }),
  }));
}

async function addMemberAndExpectReset(groupId: number, contactId: number) {
  await expect(addGroupMemberAction(groupId, contactId)).rejects.toMatchObject({
    digest: expect.stringContaining(`NEXT_REDIRECT;replace;/groups/${groupId};`),
  });
}

describe.runIf(testPostgresPort > 0)("contact groups", () => {
  beforeAll(async () => {
    database = await openTestDatabase();
    await migrate(database.db, { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await database?.close();
  });

  it.each([
    ["the contact list", ContactList],
    ["reminders", ReachOutSection],
  ] as const)("waits for a request before loading %s from PostgreSQL", async (_, render) => {
    const prerenderStop = new Error("No incoming request");
    const request = vi.mocked(connection);
    request.mockRejectedValueOnce(prerenderStop);
    vi.mocked(getDb).mockClear();

    try {
      await expect(render({
        searchParams: Promise.resolve({ group: "1" }),
      })).rejects.toBe(prerenderStop);
      expect(getDb).not.toHaveBeenCalled();
    } finally {
      request.mockReset().mockResolvedValue(undefined);
    }
  });

  it("creates an empty group with a custom name", async () => {
    const state = await createGroupAction({ name: "" }, groupNameForm(" Tennis "));

    expect(state.error).toBeUndefined();
    expect(await listGroups()).toContainEqual({ id: expect.any(Number), name: "Tennis" });
    expect(await database.db.$count(contactGroups)).toBe(0);
  });

  it.each(["", "   "])("rejects the blank name %j", async (name) => {
    const before = await listGroups();
    const state = await createGroupAction({ name: "" }, groupNameForm(name));

    expect(state.error).toBe("Укажите название группы");
    expect(await listGroups()).toEqual(before);
  });

  it("shows members with links to their contact cards", async () => {
    const group = await seedGroup("Members");
    const member = await seedContact("Member Test");
    await seedContact("Other Person");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    const html = await renderGroupPage(group.id);

    expect(html).toContain("Members");
    expect(html).toContain(`href="/contacts/${member.id}"`);
    expect(html).toContain(member.name);
    expect(html).not.toContain("Other Person");
  });

  it("explains when a group has no members", async () => {
    const group = await seedGroup("Empty group");
    const html = await renderGroupPage(group.id);
    expect(html).toContain("Участников пока нет");
    expect(html).toContain("0 контактов");
  });

  it("counts members separately from add results and offers a clear control", async () => {
    const group = await seedGroup("Member Count Group");
    const first = await seedContact("Counted Member First");
    const second = await seedContact("Counted Member Second");
    const candidate = await seedContact("Find Candidate Separately");
    await database.db.insert(contactGroups).values([
      { contactId: first.id, groupId: group.id },
      { contactId: second.id, groupId: group.id },
    ]);

    const html = await renderGroupPage(group.id, candidate.name);
    expect(html).toMatch(/Контакты для добавления[\s\S]*?Find Candidate Separately[\s\S]*?aria-labelledby="members-heading"[\s\S]*?2 контакта[\s\S]*?Counted Member First/);
    expect(html).toContain('aria-label="Очистить поиск участников"');
  });

  it("hides phone and email in member rows and keeps them in candidate rows", async () => {
    const group = await seedGroup("Member Details Group");
    const [member, candidate] = await database.db.insert(contacts).values([
      { name: "Member With Details", phone: "+70000001001", email: "member@example.com" },
      { name: "Candidate With Details", phone: "+70000001002", email: "candidate@example.com" },
    ]).returning();
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    const html = await renderGroupPage(group.id, candidate.name);
    expect(html).toContain(member.name);
    expect(html).not.toContain(member.phone);
    expect(html).not.toContain(member.email);
    expect(html).toContain(candidate.phone);
    expect(html).toContain(candidate.email);
  });

  it("shows an add button instead of an open name field in the groups section", async () => {
    const group = await seedGroup("Listed Group");
    const html = await renderView(createElement(GroupsPage));

    expect(html).not.toContain('name="name"');
    expect(html).toContain("Добавить группу");
    expect(html).toContain(`href="/groups/${group.id}"`);
  });

  it("places the edit button before delete and keeps the rename field closed initially", async () => {
    const group = await seedGroup("Closed Rename");
    const html = await renderGroupPage(group.id);

    expect(html).not.toContain('name="name"');
    expect(html).toMatch(/aria-label="Изменить группу"[\s\S]*aria-label="Удалить группу"/);
  });

  it("renames a group at the same URL and keeps its members", async () => {
    const group = await seedGroup("Old name");
    const member = await seedContact("Renamed Group Member");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    const state = await renameGroupAction(group.id, { name: group.name }, groupNameForm(" New name "));

    expect(state.error).toBeUndefined();
    expect(await getGroup(group.id)).toEqual({ id: group.id, name: "New name" });
    expect(await listGroups()).toContainEqual({ id: group.id, name: "New name" });
    const html = await renderGroupPage(group.id);
    expect(html).toContain("New name");
    expect(html).toContain(`href="/contacts/${member.id}"`);
  });

  it("deletes a confirmed group while keeping the contact, note and other membership", async () => {
    const group = await seedGroup("Delete this");
    const other = await seedGroup("Keep this");
    const member = await seedContact("Deletion Test Member");
    await database.db.insert(notes).values({ contactId: member.id, body: "An existing note" });
    await database.db.insert(contactGroups).values([
      { contactId: member.id, groupId: group.id },
      { contactId: member.id, groupId: other.id },
    ]);
    const confirmation = new FormData();
    confirmation.set("confirmation", "delete");

    await expect(deleteGroupAction(group.id, {}, confirmation)).rejects.toMatchObject({
      digest: expect.stringContaining(";/groups;"),
    });

    expect(await getGroup(group.id)).toBeUndefined();
    expect(await getContact(member.id)).toEqual(member);
    expect(await getNotes(member.id)).toEqual([
      expect.objectContaining({ body: "An existing note" }),
    ]);
    expect(await renderGroupPage(other.id)).toContain(member.name);
  });

  it("keeps the group and its members without confirmation", async () => {
    const group = await seedGroup("Cancelled deletion");
    const member = await seedContact("Cancellation Test Member");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    await deleteGroupAction(group.id, {}, new FormData());

    expect(await getGroup(group.id)).toEqual(group);
    expect(await renderGroupPage(group.id)).toContain(member.name);
  });

  it("finds an existing contact by name and adds a single membership", async () => {
    const group = await seedGroup("Search for members");
    const candidate = await seedContact("Семён Кандидат");
    const unrelated = await seedContact("Unrelated Candidate");

    const searchResults = await renderGroupPage(group.id, "кандидат семен");
    expect(searchResults).toContain(candidate.name);
    expect(searchResults).not.toContain(unrelated.name);

    await addMemberAndExpectReset(group.id, candidate.id);
    await addMemberAndExpectReset(group.id, candidate.id);
    expect(await renderGroupPage(group.id)).toContain(candidate.name);
    expect((await database.pool.query(
      "select contact_id from contact_groups where group_id = $1",
      [group.id],
    )).rows).toEqual([{ contact_id: candidate.id }]);
  });

  it("resets member search on add and does not restore the candidate on immediate removal", async () => {
    const group = await seedGroup("Reset member search");
    const candidate = await seedContact("Immediate Removal Candidate");

    expect(await renderGroupPage(group.id, candidate.name)).toContain(candidate.name);
    await addMemberAndExpectReset(group.id, candidate.id);
    expect(await renderGroupPage(group.id)).toContain(candidate.name);

    expect(await removeGroupMemberAction(group.id, candidate.id)).toEqual({});
    const afterRemoval = await renderGroupPage(group.id);
    expect(afterRemoval).not.toContain(candidate.name);
    expect(afterRemoval).toContain("Участников пока нет");
    expect(await renderGroupPage(group.id, candidate.name)).toContain(candidate.name);
  });

  it("removes only the selected membership and preserves contact data and notes", async () => {
    const group = await seedGroup("Remove membership");
    const other = await seedGroup("Retain membership");
    const member = await seedContact("Removing Member");
    const staying = await seedContact("Staying Member");
    await database.db.insert(notes).values({ contactId: member.id, body: "Keep this note" });
    await database.db.insert(contactGroups).values([
      { contactId: member.id, groupId: group.id },
      { contactId: member.id, groupId: other.id },
      { contactId: staying.id, groupId: group.id },
    ]);

    expect(await removeGroupMemberAction(group.id, member.id)).toEqual({});

    const html = await renderGroupPage(group.id);
    expect(html).not.toContain(member.name);
    expect(html).toContain(staying.name);
    expect(await renderGroupPage(other.id)).toContain(member.name);
    expect(await getContact(member.id)).toEqual(member);
    expect(await getNotes(member.id)).toEqual([expect.objectContaining({ body: "Keep this note" })]);
  });

  it("shows a recoverable empty state after removing the last member", async () => {
    const group = await seedGroup("Last member");
    const member = await seedContact("Last Group Member");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    expect(await removeGroupMemberAction(group.id, member.id)).toEqual({});

    const html = await renderGroupPage(group.id);
    expect(html).toContain("Участников пока нет");
    expect(html).toContain("Добавить участника");
    await addMemberAndExpectReset(group.id, member.id);
    expect(await renderGroupPage(group.id)).toContain(member.name);
  });

  it("saves two existing groups for a new contact", async () => {
    const family = await seedGroup("Family");
    const tennis = await seedGroup("Tennis Club");
    const name = "Two Groups Contact";

    await expect(createContactAction(emptyContactState, contactForm(name, [family.id, tennis.id])))
      .rejects.toMatchObject({ digest: expect.stringContaining(";/?added=") });

    const [contact] = await findContactsByName(name);
    expect(await getContactGroups(contact.id)).toEqual([family, tennis]);
    expect(await renderGroupPage(family.id)).toContain(name);
    expect(await renderGroupPage(tennis.id)).toContain(name);
  });

  it("keeps the other group when one group is deselected in the contact form", async () => {
    const first = await seedGroup("Deselect first");
    const second = await seedGroup("Keep second");
    const member = await seedContact("Deselect One");
    await database.db.insert(contactGroups).values([
      { contactId: member.id, groupId: first.id },
      { contactId: member.id, groupId: second.id },
    ]);

    await expect(updateContactAction(member.id, emptyContactState, contactForm(member.name, [second.id])))
      .rejects.toMatchObject({ digest: expect.stringContaining(`;/contacts/${member.id};`) });

    expect(await getContactGroups(member.id)).toEqual([second]);
    expect(await renderGroupPage(first.id)).not.toContain(member.name);
  });

  it("keeps a contact in the common list after deselecting the last group", async () => {
    const group = await seedGroup("Deselect last");
    const member = await seedContact("Deselect Last Contact");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    await expect(updateContactAction(member.id, emptyContactState, contactForm(member.name, [])))
      .rejects.toMatchObject({ digest: expect.stringContaining(`;/contacts/${member.id};`) });

    expect(await getContactGroups(member.id)).toEqual([]);
    expect(await findContactsByName(member.name)).toContainEqual(
      expect.objectContaining({ id: member.id }),
    );
  });

  it("creates a group in the same save as a new contact", async () => {
    const name = "Contact With New Group";
    const form = contactForm(name, []);
    form.set("newGroupName", "  New Analysts Group  ");

    await expect(createContactAction(emptyContactState, form)).rejects.toMatchObject({
      digest: expect.stringContaining(";/?added="),
    });

    const [contact] = await findContactsByName(name);
    const [group] = await getContactGroups(contact.id);
    expect(group).toEqual({ id: expect.any(Number), name: "New Analysts Group" });
    expect(await listGroups()).toContainEqual(group);
    expect(await renderGroupPage(group.id)).toContain(name);
  });

  it("creates a group while editing a contact and retains the selected group", async () => {
    const existing = await seedGroup("Already Selected Group");
    const member = await seedContact("Editing Contact With New Group");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: existing.id });
    const form = contactForm(member.name, [existing.id]);
    form.append("newGroupNames", "Another New Group");

    await expect(updateContactAction(member.id, emptyContactState, form)).rejects.toMatchObject({
      digest: expect.stringContaining(`;/contacts/${member.id};`),
    });

    const saved = await getContactGroups(member.id);
    expect(saved).toEqual([existing, { id: expect.any(Number), name: "Another New Group" }]);
    expect(await listGroups()).toContainEqual(saved[1]);
    expect(await renderGroupPage(saved[1].id)).toContain(member.name);
  });

  it("can leave the contact form with a draft without submitting any records", async () => {
    const member = await seedContact("Unchanged Contact");
    const groupList = await listGroups();
    const html = await renderView(createElement(ContactForm, {
      groups: groupList,
      contact: {
        id: member.id,
        values: { ...emptyContactState.values, name: member.name, newGroupName: "Discarded draft" },
      },
    }));

    expect(html).toContain('name="newGroupName"');
    expect(html).toContain('value="Discarded draft"');
    expect(html).toMatch(new RegExp(`href="/contacts/${member.id}"[^>]*>Отмена</a>`));
    expect(await listGroups()).toEqual(groupList);
    expect(await getContact(member.id)).toEqual(member);
  });

  it("shows saved groups as pressed buttons and keeps the new name input hidden initially", async () => {
    const family = await seedGroup("Pill Family");
    const tennis = await seedGroup("Pill Tennis");
    const member = await seedContact("Pill Form Contact");
    const html = await renderView(createElement(ContactForm, {
      groups: [family, tennis],
      contact: {
        id: member.id,
        values: {
          ...emptyContactState.values,
          name: member.name,
          groupIds: [String(tennis.id)],
        },
      },
    }));

    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('name="newGroupName"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Pill Tennis<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Pill Family<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>[\s\S]*?Добавить группу<\/button>/);
  });

  it("returns a group draft when contact validation fails and writes no group", async () => {
    const existing = await seedGroup("Keep Form Selection");
    const before = await listGroups();
    const form = contactForm(" ", [existing.id]);
    form.append("newGroupNames", "Queued Group");
    form.set("newGroupName", "Typed Group");

    const state = await createContactAction(emptyContactState, form);

    expect(state.fieldErrors.name).toBe("Укажите имя");
    expect(state.values).toMatchObject({
      groupIds: [String(existing.id)],
      newGroupNames: ["Queued Group"],
      newGroupName: "Typed Group",
    });
    expect(await listGroups()).toEqual(before);
  });

  it("rolls back contact changes when a selected group has been removed", async () => {
    const member = await seedContact("Original Contact Name");
    const before = await listGroups();
    const form = contactForm("Edited Contact Name", [2_147_483_647]);
    form.set("newGroupName", "Uncommitted draft");

    const state = await updateContactAction(member.id, emptyContactState, form);

    expect(state.fieldErrors.groupIds).toBeDefined();
    expect(state.values.newGroupName).toBe("Uncommitted draft");
    expect(await getContact(member.id)).toEqual(member);
    expect(await listGroups()).toEqual(before);
  });

  it("filters the contact list and count by group and restores all contacts when cleared", async () => {
    const tennis = await seedGroup("Filter Tennis");
    const friends = await seedGroup("Filter Friends");
    const empty = await seedGroup("Filter Empty");
    const anna = await seedContact("Group Filter Anna");
    const boris = await seedContact("Group Filter Boris");
    const vera = await seedContact("Group Filter Vera");
    await database.db.insert(contactGroups).values([
      { contactId: anna.id, groupId: tennis.id },
      { contactId: anna.id, groupId: friends.id },
      { contactId: boris.id, groupId: friends.id },
    ]);

    const filtered = await renderView(createElement(ContactList, {
      searchParams: Promise.resolve({ group: String(tennis.id) }),
    }));
    expect(filtered).toContain(anna.name);
    expect(filtered).toContain(tennis.name);
    expect(filtered).toContain(friends.name);
    expect(filtered).toContain("1 контакт");
    expect(filtered).not.toContain(boris.name);
    expect(filtered).not.toContain(vera.name);

    const emptyGroup = await renderView(createElement(ContactList, {
      searchParams: Promise.resolve({ group: String(empty.id) }),
    }));
    expect(emptyGroup).toContain("В группе пока нет участников");

    const cleared = await renderView(createElement(ContactList, {
      searchParams: Promise.resolve({}),
    }));
    for (const person of [anna, boris, vera]) expect(cleared).toContain(person.name);
  });

  it("places a closed group filter and group directory above reminders", async () => {
    await seedGroup("Search Panel Tennis");
    await database.db.insert(contacts).values({
      name: "Panel Reminder Contact",
      keepInTouchFrequency: "week",
      keepInTouchSetAt: new Date("2020-01-03T12:00:00Z"),
    });
    const html = await renderView(createElement(ContactsPage, {
      searchParams: Promise.resolve({}),
      params: Promise.resolve({}),
    }));

    expect(html).toMatch(/Найти контакт по имени[\s\S]*aria-expanded="false"[^>]*>[\s\S]*?Все группы[\s\S]*?href="\/groups"[^>]*>[\s\S]*?Список групп[\s\S]*?Пора связаться/);
    expect(html).not.toContain("Search Panel Tennis");
  });

  it("filters due contacts by group and restores both when the filter is cleared", async () => {
    const first = await seedGroup("First Reminder Group");
    const second = await seedGroup("Second Reminder Group");
    const dueFields = {
      keepInTouchFrequency: "week" as const,
      keepInTouchSetAt: new Date("2020-01-03T12:00:00Z"),
    };
    const [selected, outside] = await database.db.insert(contacts).values([
      { name: "Selected Reminder Contact", ...dueFields },
      { name: "Outside Reminder Contact", ...dueFields },
    ]).returning();
    await database.db.insert(contactGroups).values([
      { contactId: selected.id, groupId: first.id },
      { contactId: outside.id, groupId: second.id },
    ]);

    const filtered = await renderReminders(first.id);
    expect(filtered).toContain(selected.name);
    expect(filtered).not.toContain(outside.name);
    expect(filtered).toContain("Пора связаться · <!-- -->1");

    const cleared = await renderReminders();
    expect(cleared).toContain(selected.name);
    expect(cleared).toContain(outside.name);
    expect(await renderReminders(2_147_483_647)).toContain(outside.name);
    expect(await renderReminders(first.id, "Selected")).toBe("");
  });

  it("hides reminders for a group whose only member is not due", async () => {
    const group = await seedGroup("No Due Contact Group");
    const [outside] = await database.db.insert(contacts).values({
      name: "Other Group Due Contact",
      keepInTouchFrequency: "week",
      keepInTouchSetAt: new Date("2020-01-03T12:00:00Z"),
    }).returning();
    const member = await seedContact("No Reminder Member");
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });

    expect(await renderReminders()).toContain(outside.name);
    expect(await renderReminders(group.id)).toBe("");
  });

  it.each(["new", "edit"] as const)("shows the required-name hint above the groups in the %s form", async (mode) => {
    const html = await renderView(createElement(ContactForm, {
      groups: [],
      contact: mode === "edit"
        ? { id: 1, values: emptyContactState.values }
        : undefined,
    }));

    expect(html).toMatch(/Обязательно только имя\.[\s\S]*?<legend[^>]*>Группы<\/legend>/);
  });

  it("shows linked group tags above the details on the contact card", async () => {
    const group = await seedGroup("Card Group Tag");
    const [member] = await database.db.insert(contacts)
      .values({ name: "Card Group Member", howWeMet: "Met at tennis" })
      .returning();
    await database.db.insert(contactGroups).values({ contactId: member.id, groupId: group.id });
    const html = await renderView(createElement(ContactPage, {
      params: Promise.resolve({ id: String(member.id) }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toMatch(/<ul[^>]*aria-label="Группы"[^>]*>[\s\S]*?Card Group Tag[\s\S]*?Откуда знакомы/);
    expect(html).toContain(`href="/groups/${group.id}"`);
    expect(html).not.toContain("contact-groups-heading");
  });

  it("combines the name query with the group and preserves the other filter when clearing either", async () => {
    const tennis = await seedGroup("Search Inside Tennis");
    const empty = await seedGroup("Search Inside Empty");
    const inGroup = await seedContact("Two Matches Inside");
    const outside = await seedContact("Two Matches Outside");
    await database.db.insert(contactGroups).values({ contactId: inGroup.id, groupId: tennis.id });

    const renderList = (searchParams: Record<string, string>) =>
      renderView(createElement(ContactList, { searchParams: Promise.resolve(searchParams) }));
    const filtered = await renderList({ group: String(tennis.id), q: "Two Matches" });
    expect(filtered).toContain(inGroup.name);
    expect(filtered).not.toContain(outside.name);

    const noMatch = await renderList({ group: String(tennis.id), q: "Outside" });
    expect(noMatch).toContain(`href="/?group=${tennis.id}"`);

    const emptyWithQuery = await renderList({ group: String(empty.id), q: "Two Matches" });
    expect(emptyWithQuery).toContain("В группе пока нет участников");

    const noGroup = await renderList({ q: "Two Matches" });
    expect(noGroup).toContain(inGroup.name);
    expect(noGroup).toContain(outside.name);
  });
});
