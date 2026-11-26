import { expect, firefox, type Page } from "@playwright/test";

import { existingContactNames } from "./fixtures";
import { test } from "./reminder-fixtures";

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

function reminders(page: Page) {
  return page.getByRole("region", { name: /^Пора связаться/ });
}

function frequencyControl(page: Page) {
  return page.getByRole("region", { name: "Как часто общаться" });
}

function reminderRow(page: Page, contact: string) {
  return reminders(page).getByRole("listitem").filter({ hasText: contact });
}

function dueLine(page: Page) {
  return frequencyControl(page).getByText(/^(Следующий раз|Пора связаться) — /);
}

test("creates and finds a contact and shares its frequency and note across browsers", async ({ page, baseURL }) => {
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
    await expect(reminders(page)).toHaveCount(0);
  });

  await test.step("Create a contact and see it in the list", async () => {
    await page.getByRole("link", { name: "Добавить контакт", exact: true }).click();
    await expect(page.getByText("Как часто общаться", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Месяц", exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Имя", exact: true }).fill(name);
    await page.getByRole("button", { name: "Сохранить контакт" }).click();
    await expect(newContact).toBeVisible();
  });

  await test.step("Find the contact by first name and open its card", async () => {
    await page.getByRole("textbox", { name: "Найти контакт по имени" }).fill("Elena");
    await expect(list.getByRole("link")).toHaveCount(1);
    await newContact.click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(frequencyControl(page).getByRole("button", { name: "Не задано", pressed: true })).toBeVisible();
    await expect(frequencyControl(page).getByRole("button", { name: "Связался" })).toHaveCount(0);
    await expect(dueLine(page)).toHaveCount(0);
  });

  await test.step("Save a note and see it in the card", async () => {
    await page.getByRole("textbox", { name: "Новая заметка" }).fill(note);
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await expect(page.getByRole("listitem").getByText(note, { exact: true })).toBeVisible();
    await expect(dueLine(page)).toHaveCount(0);
  });

  await test.step("Set a frequency and reload the card", async () => {
    await frequencyControl(page).getByRole("button", { name: "Месяц", exact: true }).click();
    await expect(dueLine(page)).toContainText("Следующий раз");
    await page.reload();
    await expect(frequencyControl(page).getByRole("button", { name: "Месяц", pressed: true })).toBeVisible();
  });

  await test.step("See the same contacts, frequency and saved note in Firefox", async () => {
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
      await expect(frequencyControl(otherPage).getByRole("button", { name: "Месяц", pressed: true })).toBeVisible();
    } finally {
      await browser.close();
    }
  });

  await test.step("Unset the frequency and hide the deadline and mark button", async () => {
    await frequencyControl(page).getByRole("button", { name: "Не задано" }).click();
    await expect(dueLine(page)).toHaveCount(0);
    await expect(frequencyControl(page).getByRole("button", { name: "Связался" })).toHaveCount(0);
  });
});

test("saving an overdue contact's note restarts its deadline and removes the reminder", async ({ page, reminderData }) => {
  const name = "Overdue Note Contact";
  const note = "Had a long conversation today.";
  await reminderData.addContacts([{
    name,
    keepInTouchFrequency: "week",
    keepInTouchSetAt: new Date("2020-01-01T12:00:00Z"),
  }]);

  await page.goto("/");
  const row = reminderRow(page, name);
  await expect(row).toContainText("Раз в неделю · просрочено на");
  await expect(contactList(page).getByRole("link", { name, exact: true })).toBeVisible();
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(dueLine(page)).toContainText("Пора связаться — просрочено на");

  await page.getByRole("textbox", { name: "Новая заметка" }).fill(note);
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  const savedNote = page.getByRole("listitem").filter({ hasText: note });
  await expect(savedNote).toBeVisible();
  const timestamp = await savedNote.locator("time").getAttribute("datetime");
  if (!timestamp) throw new Error("The saved note has no timestamp.");
  const moscowTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(timestamp));
  await expect(savedNote.locator("time")).toContainText(moscowTime);
  await expect(dueLine(page)).toContainText("Следующий раз");

  await page.getByRole("link", { name: "Все контакты", exact: true }).click();
  await expect(contactList(page).getByRole("link", { name, exact: true })).toBeVisible();
  await expect(reminders(page)).toHaveCount(0);
});

test("marks contacts from their cards and the home page and offers a five-second undo window", async ({ page, reminderData }) => {
  const old = new Date("2020-01-01T12:00:00Z");
  const [first, second, early] = await reminderData.addContacts([
    { name: "First Mark Contact", keepInTouchFrequency: "month", keepInTouchSetAt: old },
    { name: "Second Mark Contact", keepInTouchFrequency: "week", keepInTouchSetAt: old },
    {
      name: "Early Mark Contact",
      keepInTouchFrequency: "month",
      keepInTouchSetAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000),
    },
  ]);

  await test.step("Mark an overdue contact from the card and undo without creating a note", async () => {
    await page.goto(`/contacts/${first.id}`);
    await expect(dueLine(page)).toContainText("Пора связаться — просрочено на");
    const originalDue = await dueLine(page).innerText();
    await frequencyControl(page).getByRole("button", { name: "Связался", exact: true }).click();
    await expect(dueLine(page)).toContainText("Следующий раз");
    await expect(frequencyControl(page).getByText("Отмечено")).toBeVisible();
    await expect(page.getByText(/Заметок пока нет/)).toBeVisible();
    await frequencyControl(page).getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(dueLine(page)).toHaveText(originalDue);
  });

  await test.step("Mark a contact before the deadline and let its undo window expire", async () => {
    await page.goto(`/contacts/${early.id}`);
    await expect(dueLine(page)).toContainText("Следующий раз");
    const originalDue = await dueLine(page).innerText();
    await frequencyControl(page).getByRole("button", { name: "Связался", exact: true }).click();
    await expect(dueLine(page)).not.toHaveText(originalDue);
    await expect(frequencyControl(page).getByRole("button", { name: "Отменить", exact: true })).toBeVisible();
    await expect(frequencyControl(page).getByRole("button", { name: "Связался", exact: true })).toBeVisible();
    await expect(frequencyControl(page).getByRole("button", { name: "Отменить", exact: true })).toHaveCount(0);
  });

  await test.step("Mark and undo from the home page, then let the mark take effect", async () => {
    await page.goto("/");
    const block = reminders(page);
    const row = reminderRow(page, first.name);
    const mark = row.getByRole("button", { name: /^Связался/ });
    const undo = row.getByRole("button", { name: /^Отменить/ });
    await expect(block.getByRole("heading")).toHaveText("Пора связаться · 2");
    await expect(block.getByRole("button", { name: /Показать всех/ })).toHaveCount(0);
    const originalRow = await row.getByRole("link").innerText();

    await mark.click();
    await expect(undo).toBeVisible();
    await expect(page).toHaveURL("/");
    await undo.click();
    await expect(row.getByRole("link")).toHaveText(originalRow, { useInnerText: true });

    await mark.click();
    await expect(undo).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(block.getByRole("heading")).toHaveText("Пора связаться · 1");
    const contact = contactList(page).getByRole("link", { name: first.name, exact: true });
    await expect(contact).toBeVisible();
    await contact.click();
    await expect(dueLine(page)).toContainText("Следующий раз");
  });

  await test.step("Open a contact's card while the home page still offers undo", async () => {
    await page.goto("/");
    const row = reminderRow(page, second.name);
    await row.getByRole("button", { name: /^Связался/ }).click();
    await expect(row.getByRole("button", { name: /^Отменить/ })).toBeVisible();
    await row.getByRole("link").click();
    await expect(page.getByRole("heading", { name: second.name, level: 1 })).toBeVisible();
    await expect(dueLine(page)).toContainText("Следующий раз");
  });
});

test("shows the oldest five reminders, expands, and applies search and group filters", async ({ page, reminderData }) => {
  const due = await reminderData.addContacts(Array.from({ length: 12 }, (_, index) => ({
    name: `Reminder Queue ${index + 1}`,
    keepInTouchFrequency: "week",
    keepInTouchSetAt: new Date(Date.UTC(2020, 0, index + 1, 12)),
  })));
  const [future] = await reminderData.addContacts([{
    name: "Future Reminder",
    keepInTouchFrequency: "week",
    keepInTouchSetAt: new Date(),
  }]);
  await reminderData.addGroup("First Reminder Group", [due[0]]);
  await reminderData.addGroup("Five Reminder Group", due.slice(1, 6));
  await reminderData.addGroup("Future Reminder Group", [future]);

  await page.goto("/");
  const block = reminders(page);
  const rows = block.getByRole("listitem");
  const listedContacts = contactList(page).getByRole("link");
  const expand = block.getByRole("button", { name: "Показать всех (12)" });
  await expect(rows).toHaveCount(5);
  for (const [index, contact] of due.slice(0, 5).entries()) {
    await expect(rows.nth(index).getByRole("link")).toHaveAttribute("href", `/contacts/${contact.id}`);
  }
  await expand.click();
  await expect(rows).toHaveCount(12);
  await block.getByRole("button", { name: "Свернуть", exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(expand).toBeVisible();

  await page.getByRole("textbox", { name: "Найти контакт по имени" }).fill(future.name);
  await expect(listedContacts).toHaveCount(1);
  await expect(listedContacts).toHaveAttribute("href", `/contacts/${future.id}`);
  await expect(block).toHaveCount(0);
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await expect(rows).toHaveCount(5);

  const filter = page.getByRole("button", { name: /^Фильтр по группе:/ });
  await filter.click();
  await page.getByRole("button", { name: "First Reminder Group", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(reminderRow(page, due[0].name)).toBeVisible();
  await expect(block.getByRole("button", { name: /Показать всех/ })).toHaveCount(0);

  await filter.click();
  await page.getByRole("button", { name: "Five Reminder Group", exact: true }).click();
  await expect(block.getByRole("heading")).toHaveText("Пора связаться · 5");
  await expect(rows).toHaveCount(5);
  await expect(block.getByRole("button", { name: /Показать всех/ })).toHaveCount(0);

  await filter.click();
  await page.getByRole("button", { name: "Future Reminder Group", exact: true }).click();
  await expect(listedContacts).toHaveCount(1);
  await expect(listedContacts).toHaveAttribute("href", `/contacts/${future.id}`);
  await expect(block).toHaveCount(0);

  await filter.click();
  await page.getByRole("button", { name: "Все группы", exact: true }).click();
  await expect(expand).toBeVisible();
  await expect(rows).toHaveCount(5);
});
