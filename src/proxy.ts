import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { appOrigin, getAuth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const signIn = () => NextResponse.redirect(new URL("/login", appOrigin()));
  if (!getSessionCookie(request)) return signIn();

  const prefetch =
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch") === true;
  try {
    const result = await getAuth().api.getSession({
      headers: request.headers,
      query: { disableRefresh: prefetch || request.method === "HEAD" },
      asResponse: true,
    });
    const session = result.ok ? await result.json() : null;
    const response = session ? NextResponse.next() : signIn();
    for (const cookie of result.headers.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    return response;
  } catch {
    console.error("Failed to refresh a sign-in session");
    return new NextResponse(null, { status: 503 });
  }
}

export const config = {
  matcher: [
    {
      source: "/((?:contacts|groups)(?:/.*)?|$)",
      // Next.js removes these headers before invoking Proxy. The pages still check access.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "next-router-segment-prefetch" },
      ],
    },
  ],
};
