import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseConfig } from "../../src/db/config";
import { login } from "./login-fixtures";

async function createContact(page: Page, name: string, group?: string) {
  await page.goto("/contacts/new");
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill(name);
  if (group) await page.getByRole("button", { name: group, exact: true }).click();
  await page.getByRole("button", { name: "Сохранить контакт" }).click();
  const contact = page
    .getByRole("region", { name: "Список контактов" })
    .getByRole("link", { name });
  await expect(contact).toBeVisible();
  const card = await contact.getAttribute("href");
  if (!card) throw new Error("Contact link is missing");
  return card;
}

async function createGroup(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "Список групп" }).click();
  await page.getByRole("button", { name: "Добавить группу" }).click();
  await page.getByRole("textbox", { name: "Название группы" }).fill(name);
  await page.getByRole("button", { name: "Создать группу" }).click();
  const group = page.getByRole("link", { name, exact: true });
  await expect(group).toBeVisible();
  const path = await group.getAttribute("href");
  if (!path) throw new Error("Group link is missing");
  return path;
}

test("two people each see only their own contacts in the list, search and cards", async ({
  page,
  browser,
  baseURL,
}) => {
  const a = "Alina Isolated";
  const b = "Boris Isolated";
  await login(page, `contact-a-${randomUUID()}@example.com`);
  const aCard = await createContact(page, a);
  const other = await browser.newPage({ baseURL });
  try {
    await login(other, `contact-b-${randomUUID()}@example.com`);
    await expect(other.getByText("Добавь первый контакт")).toBeVisible();
    const bCard = await createContact(other, b);

    for (const [browserPage, own, foreign, foreignCard] of [
      [page, a, b, bCard],
      [other, b, a, aCard],
    ] as const) {
      await browserPage.goto("/");
      await expect(browserPage.getByRole("link", { name: own })).toBeVisible();
      await expect(browserPage.getByRole("link", { name: foreign })).toHaveCount(0);
      await expect(browserPage.getByText("1 контакт", { exact: true })).toBeVisible();
      await browserPage.getByRole("textbox", { name: "Найти контакт по имени" }).fill(foreign);
      await expect(browserPage.getByText("Никого не нашлось")).toBeVisible();
      await browserPage.goto(foreignCard);
      await expect(browserPage.getByRole("heading", { name: "Контакт не найден" })).toBeVisible();
      await expect(browserPage).toHaveTitle(/^Контакт не найден/);
      await browserPage.goto(`${foreignCard}/edit`);
      await expect(browserPage.getByRole("heading", { name: "Контакт не найден" })).toBeVisible();
      await expect(browserPage).toHaveTitle(/^Контакт не найден/);
    }
  } finally {
    await other.close();
  }
});

test("isolates group names, members, filters and reminders between accounts", async ({
  page,
  browser,
  baseURL,
}) => {
  const a = "Anna Due Contact";
  const b = "Boris Due Contact";
  const friends = "Друзья";
  const tennis = "Теннис";
  const pool = new Pool(getDatabaseConfig());
  const other = await browser.newPage({ baseURL });
  try {
    await login(page, `groups-a-${randomUUID()}@example.com`);
    const aGroup = await createGroup(page, friends);
    const aTennis = await createGroup(page, tennis);
    const aCard = await createContact(page, a, friends);

    await login(other, `groups-b-${randomUUID()}@example.com`);
    const bGroup = await createGroup(other, friends);
    expect(bGroup).not.toBe(aGroup);
    const bCard = await createContact(other, b, friends);
    await pool.query(
      `update contacts set keep_in_touch_frequency = 'week', keep_in_touch_set_at = now() - interval '20 days' where id in ($1, $2)`,
      [aCard.split("/").at(-1), bCard.split("/").at(-1)],
    );

    for (const [browserPage, own, foreign, group, foreignGroup] of [
      [page, a, b, aGroup, bGroup],
      [other, b, a, bGroup, aGroup],
    ] as const) {
      await browserPage.goto("/groups");
      await expect(browserPage.getByRole("link", { name: friends, exact: true })).toHaveCount(1);
      await browserPage.goto(group);
      await expect(browserPage.getByRole("link", { name: own })).toBeVisible();
      await expect(browserPage.getByRole("link", { name: foreign })).toHaveCount(0);
      await browserPage.goto(foreignGroup);
      await expect(browserPage.getByRole("heading", { name: "Группа не найдена" })).toBeVisible();
      await expect(browserPage).toHaveTitle(/^Группа не найдена/);

      await browserPage.goto("/");
      const reminders = browserPage.getByRole("region", { name: /^Пора связаться/ });
      await expect(reminders.getByRole("heading")).toHaveText("Пора связаться · 1");
      await expect(reminders.getByRole("link", { name: own })).toBeVisible();
      await expect(reminders.getByRole("link", { name: foreign })).toHaveCount(0);
    }

    await other.goto(`/?group=${aTennis.split("/").at(-1)}`);
    const filter = other.getByRole("button", { name: "Фильтр по группе: Все группы" });
    await expect(filter).toBeVisible();
    await filter.click();
    await other.getByRole("searchbox", { name: "Найти группу" }).fill(tennis);
    await expect(other.getByText("Групп с таким названием нет.")).toBeVisible();
    await expect(other.getByRole("link", { name: a })).toHaveCount(0);
    await other.goto(`/?group=${aGroup.split("/").at(-1)}&q=${encodeURIComponent(a)}`);
    await expect(other.getByText("Никого не нашлось")).toBeVisible();
  } finally {
    await other.close();
    await pool.end();
  }
});
