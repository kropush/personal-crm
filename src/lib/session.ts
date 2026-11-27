import "server-only";

import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "./auth";

export const getCurrentUser = cache(async () => {
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) return null;
  try {
    const result = await getAuth().api.getSession({
      headers: requestHeaders,
      query: { disableRefresh: true },
    });
    return result?.user ?? null;
  } catch {
    throw new Error("Failed to read the sign-in session");
  }
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
