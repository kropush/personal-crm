import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseConfig } from "../../src/db/config";
import { legacyData } from "./fixtures";
import { login, requestLoginLink } from "./login-fixtures";

test("signs in from an email, rejects an old link and signs out only one device", async ({
  page,
  browser,
  baseURL,
}) => {
  const email = `login-${randomUUID()}@example.com`;
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await page.getByRole("textbox", { name: "Почта" }).fill("invalid");
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText("Проверь адрес почты")).toBeVisible();

  const link = await requestLoginLink(page, email);
  const token = new URL(link).searchParams.get("token");
  const nativeIssue = await page.request.post("/api/auth/sign-in/magic-link", { data: { email } });
  const nativeVerify = await page.request.get(`/api/auth/magic-link/verify?token=${token}`);
  expect(nativeIssue.status()).toBe(404);
  expect(nativeVerify.status()).toBe(404);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  const other = await browser.newPage({ baseURL });
  try {
    await other.goto(link);
    await expect(other.getByText("Ссылка устарела, запроси новую")).toBeVisible();
    await other.getByRole("link", { name: "На страницу входа" }).click();
    await expect(other.getByRole("textbox", { name: "Почта" })).toBeVisible();
    await login(other, email);

    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("textbox", { name: "Почта" })).toBeVisible();
    await other.reload();
    await expect(other.getByRole("banner").getByText(email)).toBeVisible();
  } finally {
    await other.close();
  }
});

test("requires sign-in on CRM pages and when a previously opened form is submitted", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/contacts/new",
    "/contacts/1",
    "/contacts/1/edit",
    "/groups",
    "/groups/1",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/login");
  }
  expect((await page.request.get("/health")).ok()).toBe(true);
  const background = await page.request.get(legacyData.cardUrl, {
    headers: { "next-router-prefetch": "1" },
    maxRedirects: 0,
  });
  expect(await background.text()).not.toContain(legacyData.contact);

  const email = `expired-form-${randomUUID()}@example.com`;
  await login(page, email);
  await page.goto("/contacts/new");
  await page.getByRole("textbox", { name: "Имя", exact: true }).fill("Expired draft");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Сохранить контакт" }).click();
  await expect(page).toHaveURL("/login");
  await login(page, email);
  await expect(page.getByText("Добавь первый контакт")).toBeVisible();
});

test("extends sign-in on a page visit and expires it after thirty idle days", async ({ page }) => {
  const email = `session-${randomUUID()}@example.com`;
  const pool = new Pool(getDatabaseConfig());
  try {
    await login(page, email);
    const cookie = (await page.context().cookies()).find(({ name }) =>
      name.endsWith("session_token"),
    );
    if (!cookie) throw new Error("The browser has no session cookie");
    await page.context().addCookies([{ ...cookie, expires: Math.floor(Date.now() / 1000) + 3600 }]);
    await pool.query(
      'update session set expires_at = now() + interval \'1 hour\' from "user" where session.user_id = "user".id and "user".email = $1',
      [email],
    );
    const prefetch = await page.request.get("/contacts/new", {
      headers: {
        rsc: "1",
        "next-router-prefetch": "1",
        "next-router-segment-prefetch": "/_tree",
      },
    });
    expect(prefetch.ok()).toBe(true);
    expect("set-cookie" in prefetch.headers()).toBe(false);

    await page.reload();
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();
    const renewed = (await page.context().cookies()).find(({ name }) => name === cookie.name);
    expect(renewed?.expires).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 86400);
    const {
      rows: [session],
    } = await pool.query(
      'select expires_at from session join "user" on session.user_id = "user".id where "user".email = $1',
      [email],
    );
    expect(session.expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * 86400 * 1000);

    await pool.query(
      'update session set expires_at = now() - interval \'1 second\' from "user" where session.user_id = "user".id and "user".email = $1',
      [email],
    );
    await page.reload();
    await expect(page).toHaveURL("/login");
  } finally {
    await pool.end();
  }
});
