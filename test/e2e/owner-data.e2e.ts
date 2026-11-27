import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { demoOwnerEmail, legacyData } from "./fixtures";
import { login } from "./login-fixtures";

test("the original contact and group URLs keep their data under the migration owner", async ({
  page,
  browser,
  baseURL,
}) => {
  await login(page, legacyData.email);
  await expect(
    page.getByRole("region", { name: "Список контактов" }).getByText("1 контакт"),
  ).toBeVisible();
  await page.goto(legacyData.cardUrl);
  await expect(page.getByRole("heading", { name: legacyData.contact })).toBeVisible();
  await expect(page.getByText(legacyData.note)).toBeVisible();
  await expect(page.getByRole("button", { name: "Месяц", pressed: true })).toBeVisible();
  await expect(page.getByRole("link", { name: legacyData.group })).toHaveAttribute(
    "href",
    legacyData.groupUrl,
  );
  await page.goto(legacyData.groupUrl);
  await expect(page.getByRole("heading", { name: legacyData.group })).toBeVisible();
  await expect(page.getByRole("link", { name: legacyData.contact })).toHaveAttribute(
    "href",
    legacyData.cardUrl,
  );

  const other = await browser.newPage({ baseURL });
  try {
    await login(other, `legacy-other-${randomUUID()}@example.com`);
    await expect(other.getByText("Добавь первый контакт")).toBeVisible();
    await other.goto(legacyData.cardUrl);
    await expect(other.getByRole("heading", { name: "Контакт не найден" })).toBeVisible();
    await other.goto(legacyData.groupUrl);
    await expect(other.getByRole("heading", { name: "Группа не найдена" })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("only the configured owner sees seeded contacts and notes in the demo database", async ({
  browser,
}) => {
  const baseURL = process.env.CRM_E2E_DEMO_URL;
  const demo = await browser.newPage({ baseURL });
  const other = await browser.newPage({ baseURL });
  try {
    await login(demo, demoOwnerEmail);
    const list = demo.getByRole("region", { name: "Список контактов" });
    await expect(list.getByText(/1\s000 контактов/)).toBeVisible();
    const contact = list.getByRole("link", { name: "Дарья Тестова" });
    await expect(contact).toBeVisible();
    const card = await contact.getAttribute("href");
    if (!card) throw new Error("Demo contact link is missing");
    await contact.click();
    await expect(demo.getByRole("heading", { name: "Дарья Тестова" })).toBeVisible();
    await expect(demo.getByRole("listitem")).toHaveCount(1);

    await login(other, `demo-other-${randomUUID()}@example.com`);
    await expect(other.getByText("Добавь первый контакт")).toBeVisible();
    await other.goto(card);
    await expect(other.getByRole("heading", { name: "Контакт не найден" })).toBeVisible();
  } finally {
    await demo.close();
    await other.close();
  }
});
