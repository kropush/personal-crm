import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { migrateDatabase } from "../src/db/migrations";
import { openTestDatabase, testPostgresPort } from "./database";
import { withTemporaryMailpit } from "./temporary-mailpit";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => database.db }));

let database: Awaited<ReturnType<typeof openTestDatabase>>;
const origin = "http://127.0.0.1:3100";

async function withLogin(
  test: (api: {
    issue: (email: string) => Promise<Response>;
    redeem: (link: string) => Promise<Response>;
    links: (email: string) => Promise<string[]>;
  }) => Promise<void>,
) {
  database = await openTestDatabase();
  try {
    await migrateDatabase(database.pool);
    await withTemporaryMailpit(async ({ webUrl, smtpPort }) => {
      vi.stubEnv("CRM_APP_URL", origin);
      vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-for-login-links");
      vi.stubEnv("CRM_MAIL_TRANSPORT", "mailpit");
      vi.stubEnv("CRM_MAILPIT_SMTP_PORT", String(smtpPort));
      const { POST } = await import("../src/app/login/request/route");
      const { GET } = await import("../src/app/login/verify/route");
      await test({
        issue: (email) =>
          POST(
            new Request(`${origin}/login/request`, {
              method: "POST",
              headers: { "content-type": "application/json", origin },
              body: JSON.stringify({ email }),
            }),
          ),
        redeem: (link) => GET(new Request(link)),
        links: async (email) => {
          const response = await fetch(`${webUrl}/api/v1/messages`);
          const { messages } = (await response.json()) as {
            messages: { ID: string; To: { Address: string }[] }[];
          };
          return Promise.all(
            messages
              .filter((mail) => mail.To.some(({ Address }) => Address === email))
              .map(async ({ ID }) => {
                const response = await fetch(`${webUrl}/api/v1/message/${ID}`);
                const mail = await response.json();
                const link = mail.HTML.match(/href="([^"]+)"/)?.[1];
                if (!link) throw new Error("No sign-in link in the email");
                return link;
              }),
          );
        },
      });
    });
  } finally {
    vi.unstubAllEnvs();
    await database.close();
  }
}

describe.runIf(testPostgresPort > 0)("login links", () => {
  it(
    "issues a fifteen-minute link, replaces it and accepts the latest link only once",
    () =>
      withLogin(async ({ issue, links, redeem }) => {
        const email = "links@example.com";
        expect((await issue(email)).status).toBe(200);
        const [expired] = await links(email);
        const validity = await database.pool.query(
          "select extract(epoch from expires_at - created_at)::int as seconds from verification",
        );
        expect(validity.rows).toEqual([{ seconds: 900 }]);
        await database.pool.query(
          "update verification set expires_at = now() - interval '1 second'",
        );
        expect((await redeem(expired)).headers.get("location")).toBe(`${origin}/login?expired=1`);

        expect((await issue(email)).status).toBe(200);
        const previous = (await links(email)).find((link) => link !== expired);
        if (!previous) throw new Error("Replacement email did not arrive");
        expect((await issue(email)).status).toBe(200);
        const latest = (await links(email)).find((link) => link !== expired && link !== previous);
        if (!latest) throw new Error("Latest email did not arrive");
        expect((await redeem(previous)).headers.get("location")).toBe(`${origin}/login?expired=1`);
        const outcomes = await Promise.all([redeem(latest), redeem(latest)]);
        expect(outcomes.map((response) => response.headers.get("location")).sort()).toEqual([
          `${origin}/`,
          `${origin}/login?expired=1`,
        ]);
        expect(
          outcomes.filter((response) => response.headers.getSetCookie().length > 0),
        ).toHaveLength(1);
        expect((await redeem(latest)).headers.get("location")).toBe(`${origin}/login?expired=1`);
        expect(
          (await database.pool.query('select email, email_verified from "user"')).rows,
        ).toEqual([{ email, email_verified: true }]);
        expect((await database.pool.query("select id from session")).rows).toHaveLength(1);
      }),
    30_000,
  );

  it(
    "reserves three sends per normalized email, keeps the last link and rolls the window forward",
    () =>
      withLogin(async ({ issue, links, redeem }) => {
        const email = "limit@example.com";
        const outcomes = await Promise.all([
          issue(email),
          issue("  LIMIT@Example.com  "),
          issue(email),
          issue(email),
          issue(email),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 200, 200, 429, 429]);
        expect(await outcomes.find(({ status }) => status === 429)?.json()).toMatchObject({
          message: "Слишком часто, попробуй через несколько минут",
        });
        const messages = await links(email);
        expect(messages).toHaveLength(3);
        expect((await issue("other@example.com")).status).toBe(200);
        expect(await links("other@example.com")).toHaveLength(1);

        const {
          rows: [newest],
        } = await database.pool.query(
          "select token_hash from magic_link_requests where email = $1 order by created_at desc limit 1",
          [email],
        );
        const latest = messages.find((link) => {
          const token = new URL(link).searchParams.get("token");
          return (
            token && createHash("sha256").update(token).digest("base64url") === newest.token_hash
          );
        });
        if (!latest) throw new Error("Latest email did not arrive");
        expect((await redeem(latest)).headers.get("location")).toBe(`${origin}/`);

        await database.pool.query(
          `update magic_link_requests set created_at = now() - interval '10 minutes 1 second'
        where token_hash = (select token_hash from magic_link_requests where email = $1 order by created_at limit 1)`,
          [email],
        );
        expect((await issue(email)).status).toBe(200);
        expect(await links(email)).toHaveLength(4);
        expect((await issue(email)).status).toBe(429);
      }),
    30_000,
  );
});
