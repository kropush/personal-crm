import { describe, expect, it, vi } from "vitest";

import { migrateDatabase } from "../src/db/migrations";
import { openTestDatabase, testPostgresPort } from "./database";
import { withTemporaryMailpit } from "./temporary-mailpit";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => database.db }));

let database: Awaited<ReturnType<typeof openTestDatabase>>;

describe.runIf(testPostgresPort > 0)("login email", () => {
  it("validates direct requests and sends the same confirmation for new and known addresses", async () => {
    database = await openTestDatabase();
    try {
      await migrateDatabase(database.pool);
      await database.pool.query(
        `insert into "user" (id, name, email, email_verified)
         values ('known', '', 'known@example.com', true)`,
      );
      await withTemporaryMailpit(async ({ webUrl, smtpPort }) => {
        vi.stubEnv("CRM_APP_URL", "http://127.0.0.1:3100");
        vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-for-email-integration");
        vi.stubEnv("CRM_MAIL_TRANSPORT", "mailpit");
        vi.stubEnv("CRM_MAILPIT_SMTP_PORT", String(smtpPort));

        const { POST } = await import("../src/app/login/request/route");
        const request = (email: unknown) =>
          POST(
            new Request("http://127.0.0.1:3100/login/request", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email }),
            }),
          );

        for (const input of ["", "not-an-address", "a@@example.com", 123]) {
          const response = await request(input);
          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({
            status: "invalid",
            message: "Проверь адрес почты",
          });
        }
        const mailbox = async () => {
          const response = await fetch(`${webUrl}/api/v1/messages`);
          return (await response.json()).messages as { ID: string }[];
        };
        expect(await mailbox()).toEqual([]);
        for (const input of ["  NEW@example.com  ", "known@example.com"]) {
          const response = await request(input);
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            status: "sent",
            message: `Ссылка для входа отправлена на ${input.trim().toLowerCase()}`,
          });
        }

        const messages = await mailbox();
        expect(messages).toHaveLength(2);
        for (const { ID } of messages) {
          const response = await fetch(`${webUrl}/api/v1/message/${ID}`);
          const mail = await response.json();
          expect(mail.From).toMatchObject({
            Name: "Личная CRM",
            Address: "noreply@mail.crm.kropcrm.ru",
          });
          expect(mail.Subject).toBe("Вход в Личную CRM");
          expect(mail.HTML).toMatch(/<h1\b[^>]*>Вход в Личную CRM<\/h1>/);
          expect(mail.HTML).toContain("background-color:#08081a");
          expect(mail.HTML).toContain("linear-gradient(90deg, #4b47f2, #8a4cf0");
          expect(mail.HTML).toMatch(
            /href="http:\/\/127\.0\.0\.1:3100\/login\/verify\?token=[^"]+">Войти<\/a>/,
          );
          expect(mail.Text).toContain("15 минут");
          expect(mail.Text).toContain("Если вы не запрашивали вход - просто проигнорируйте письмо");
        }
      });
    } finally {
      vi.unstubAllEnvs();
      await database.close();
    }
  }, 30_000);
});
