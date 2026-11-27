import { appOrigin, getAuth } from "@/lib/auth";

export async function POST(request: Request) {
  const origin = appOrigin();
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403 });
  try {
    const result = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
    if (!result.ok) return new Response(null, { status: 503 });
    const headers = new Headers({
      Location: new URL("/login", origin).href,
      "Cache-Control": "no-store",
    });
    for (const cookie of result.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 303, headers });
  } catch {
    console.error("Failed to sign out");
    return new Response(null, { status: 503 });
  }
}
