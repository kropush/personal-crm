import "server-only";

import { normalizeLoginEmail } from "./login-email";
import { issueLoginLink } from "./login-links";

export async function submitLoginRequest(input: unknown, headers: Headers) {
  const email = normalizeLoginEmail(input);
  if (!email) return { status: "invalid", message: "Проверь адрес почты" } as const;

  try {
    if ((await issueLoginLink(email, headers)) === "limited") {
      return {
        status: "limited",
        message: "Слишком часто, попробуй через несколько минут",
      } as const;
    }
    return { status: "sent", message: `Ссылка для входа отправлена на ${email}` } as const;
  } catch {
    console.error("Failed to issue a sign-in link");
    return { status: "error", message: "Не удалось отправить ссылку, попробуй ещё раз" } as const;
  }
}
