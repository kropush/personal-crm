import "server-only";

import { desc, eq, lt, sql, and, gt } from "drizzle-orm";

import { getDb } from "@/db";
import { magicLinkRequests, verification } from "@/db/auth-schema";

import { appOrigin, createAuth, hashLoginToken, LINK_MINUTES } from "./auth";
import { createLoginMailer, sendLoginMail } from "./login-mail";

const RATE_LIMIT = 3;
const RATE_MINUTES = 10;
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function lockEmail(tx: Transaction, email: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${email}, 21002641))`);
}

function postgresMinutesAgo(minutes: number) {
  return sql`clock_timestamp() - ${minutes} * interval '1 minute'`;
}

export async function issueLoginLink(email: string, headers: Headers) {
  const mailer = createLoginMailer();
  const issued = await getDb().transaction(async (tx) => {
    await lockEmail(tx, email);
    const forEmail = eq(magicLinkRequests.email, email);
    const recent = await tx.$count(
      magicLinkRequests,
      and(forEmail, gt(magicLinkRequests.createdAt, postgresMinutesAgo(RATE_MINUTES))),
    );
    if (recent >= RATE_LIMIT) return null;

    let token: string | undefined;
    const auth = createAuth(tx, async (link) => {
      token = link.token;
    });
    await auth.api.signInMagicLink({ headers, body: { email } });
    if (!token) throw new Error("Better Auth did not issue a sign-in token");
    const tokenHash = hashLoginToken(token);
    await tx
      .delete(magicLinkRequests)
      .where(and(forEmail, lt(magicLinkRequests.createdAt, postgresMinutesAgo(LINK_MINUTES))));
    await tx
      .insert(magicLinkRequests)
      .values({ email, tokenHash, createdAt: sql`clock_timestamp()` });
    return { token, tokenHash };
  });
  if (!issued) return "limited";

  const link = new URL("/login/verify", appOrigin());
  link.searchParams.set("token", issued.token);
  try {
    await sendLoginMail(mailer, email, link);
  } catch (error) {
    const responseCode =
      error instanceof Error && "responseCode" in error ? error.responseCode : undefined;
    if (typeof responseCode === "number" && responseCode >= 400 && responseCode < 600) {
      await getDb().transaction(async (tx) => {
        await lockEmail(tx, email);
        await tx.delete(magicLinkRequests).where(eq(magicLinkRequests.tokenHash, issued.tokenHash));
        await tx
          .delete(verification)
          .where(eq(verification.identifier, `magic-link:${issued.tokenHash}`));
      });
    }
    throw error;
  }
  return "sent";
}

export async function redeemLoginLink(token: string, headers: Headers) {
  const tokenHash = hashLoginToken(token);
  return getDb().transaction(async (tx) => {
    const [request] = await tx
      .select({ email: magicLinkRequests.email })
      .from(magicLinkRequests)
      .where(eq(magicLinkRequests.tokenHash, tokenHash));
    if (!request) return null;

    await lockEmail(tx, request.email);
    const [latest] = await tx
      .select({ tokenHash: magicLinkRequests.tokenHash })
      .from(magicLinkRequests)
      .where(eq(magicLinkRequests.email, request.email))
      .orderBy(desc(magicLinkRequests.createdAt))
      .limit(1);
    if (latest?.tokenHash !== tokenHash) return null;

    const response = await createAuth(tx).api.magicLinkVerify({
      headers,
      query: { token },
      asResponse: true,
    });
    return response.ok ? response.headers.getSetCookie() : null;
  });
}
