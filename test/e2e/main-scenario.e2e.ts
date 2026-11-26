import { expect, firefox, test, type Page } from "@playwright/test";

import { existingContactNames } from "./fixtures";

function contactList(page: Page) {
  return page.getByRole("list").filter({ has: page.locator('[id^="contact-"]') });
}

test("creates and finds a contact and saves a note visible in another browser", async ({ page, baseURL }) => {
  const name = "Elena Sokolova";
  const note = "Agreed to meet for coffee on Friday.";
  const list = contactList(page);
  const newContact = list.getByRole("link", { name });

  await test.step("Open the full contact list", async () => {
    await page.goto("/");
    await expect(list.getByRole("link")).toHaveCount(existingContactNames.length);
    for (const existingName of existingContactNames) {
      await expect(list.getByRole("link", { name: existingName, exact: true })).toBeVisible();
    }
  });

  await test.step("Create a contact and see it in the list", async () => {
    await page.getByRole("link", { name: "Добавить контакт", exact: true }).click();
    await page.getByRole("textbox", { name: "Имя", exact: true }).fill(name);
    await page.getByRole("button", { name: "Сохранить контакт" }).click();
    await expect(newContact).toBeVisible();
  });

  await test.step("Find the contact by first name and open its card", async () => {
    await page.getByRole("textbox", { name: "Найти контакт по имени" }).fill("Elena");
    await expect(list.getByRole("link")).toHaveCount(1);
    await newContact.click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  });

  await test.step("Save a note and see it in the card", async () => {
    await page.getByRole("textbox", { name: "Новая заметка" }).fill(note);
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await expect(page.getByRole("listitem").getByText(note, { exact: true })).toBeVisible();
  });

  await test.step("See the same contacts and saved note in Firefox", async () => {
    const browser = await firefox.launch();
    try {
      const otherPage = await browser.newPage({ baseURL });
      const otherList = contactList(otherPage);
      const names = [...existingContactNames, name];

      await otherPage.goto("/");
      await expect(otherList.getByRole("link")).toHaveCount(names.length);
      for (const contactName of names) {
        await expect(otherList.getByRole("link", { name: contactName, exact: true })).toBeVisible();
      }

      await otherList.getByRole("link", { name, exact: true }).click();
      await expect(otherPage.getByRole("heading", { name, level: 1 })).toBeVisible();
      await expect(otherPage.getByRole("listitem").getByText(note, { exact: true })).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});
