import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { createHash } from "node:crypto";

import { getDb } from "@/db";
import { account, session, user, verification } from "@/db/auth-schema";

export const LINK_MINUTES = 15;
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function appOrigin() {
  const value = process.env.CRM_APP_URL;
  if (!value) throw new Error("Set CRM_APP_URL before starting sign-in");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.href !== `${url.origin}/`) {
    throw new Error("CRM_APP_URL must be an HTTP or HTTPS origin");
  }
  return url.origin;
}

export function hashLoginToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

type CaptureMagicLink = (link: { token: string }) => Promise<void>;

export function createAuth(
  db: Parameters<typeof drizzleAdapter>[0],
  sendMagicLink: CaptureMagicLink = async () => {
    throw new Error("Use the application endpoint to issue sign-in links");
  },
) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Set BETTER_AUTH_SECRET before starting sign-in");

  return betterAuth({
    appName: "Personal CRM",
    baseURL: appOrigin(),
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { account, session, user, verification },
      transaction: true,
    }),
    session: { expiresIn: SESSION_SECONDS, updateAge: 0 },
    rateLimit: { enabled: false },
    logger: { disabled: true },
    plugins: [
      magicLink({
        expiresIn: LINK_MINUTES * 60,
        storeToken: { type: "custom-hasher", hash: async (token) => hashLoginToken(token) },
        sendMagicLink,
      }),
    ],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (auth ??= createAuth(getDb()));
}
