import { z } from "zod";

const loginEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());

export function normalizeLoginEmail(value: unknown): string | null {
  const result = loginEmail.safeParse(value);
  return result.success ? result.data : null;
}
