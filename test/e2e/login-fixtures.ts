import { expect, type Page } from "@playwright/test";

type MailSummary = { ID: string; To: { Address: string }[] };

async function mailbox(email: string) {
  const response = await fetch(`${process.env.CRM_TEST_MAILPIT_URL}/api/v1/messages`);
  if (!response.ok) throw new Error("Could not read the test mailbox");
  const { messages } = (await response.json()) as { messages: MailSummary[] };
  return messages.filter((mail) => mail.To.some(({ Address }) => Address === email));
}

export async function requestLoginLink(page: Page, input: string) {
  const email = input.trim().toLowerCase();
  const previous = new Set((await mailbox(email)).map(({ ID }) => ID));
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Почта" }).fill(input);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText(`Ссылка для входа отправлена на ${email}`)).toBeVisible();

  let message: MailSummary | undefined;
  await expect
    .poll(async () => {
      message = (await mailbox(email)).find(({ ID }) => !previous.has(ID));
      return Boolean(message);
    })
    .toBe(true);
  const response = await fetch(`${process.env.CRM_TEST_MAILPIT_URL}/api/v1/message/${message?.ID}`);
  const { HTML } = (await response.json()) as { HTML: string };
  const link = HTML.match(/href="([^"]+)">Войти<\/a>/)?.[1];
  if (!link) throw new Error("Sign-in email did not contain its link");
  return link;
}

export async function login(page: Page, email: string) {
  await page.goto(await requestLoginLink(page, email));
  await expect(
    page.getByRole("banner").getByText(email.trim().toLowerCase(), { exact: true }),
  ).toBeVisible();
}
