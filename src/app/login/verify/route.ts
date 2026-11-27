import { appOrigin } from "@/lib/auth";
import { redeemLoginLink } from "@/lib/login-links";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  let cookies: string[] | null = null;
  try {
    if (token && /^[a-zA-Z]{32}$/.test(token))
      cookies = await redeemLoginLink(token, request.headers);
  } catch {
    console.error("Failed to verify a sign-in link");
  }

  const headers = new Headers({
    Location: new URL(cookies?.length ? "/" : "/login?expired=1", appOrigin()).href,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of cookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}
