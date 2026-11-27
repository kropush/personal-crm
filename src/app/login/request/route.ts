import { appOrigin } from "@/lib/auth";
import { submitLoginRequest } from "@/lib/login-request";

const statusCodes = { sent: 200, invalid: 400, limited: 429, error: 503 };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin()) return new Response(null, { status: 403 });

  const body: unknown =
    request.headers.get("content-type")?.split(";")[0] === "application/json"
      ? await request.json().catch(() => null)
      : null;
  const email = body && typeof body === "object" && "email" in body ? body.email : null;
  const result = await submitLoginRequest(email, request.headers);
  return Response.json(result, {
    status: statusCodes[result.status],
    headers: { "Cache-Control": "no-store" },
  });
}
