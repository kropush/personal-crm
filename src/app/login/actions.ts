"use server";

import { headers } from "next/headers";
import { submitLoginRequest } from "@/lib/login-request";

type LoginState = Awaited<ReturnType<typeof submitLoginRequest>> | null;

export async function requestLoginAction(
  _previous: LoginState,
  data: FormData,
): Promise<LoginState> {
  return submitLoginRequest(data.get("email"), await headers());
}
