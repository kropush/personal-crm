import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// Dark band with the "sunrise" glow and rays, a short version of the landing page hero
export function AppHeader() {
  return (
    <header className="relative overflow-hidden bg-night">
      <div
        aria-hidden
        className="absolute -inset-x-15 -bottom-30 h-50 rounded-full bg-sunrise md:inset-x-auto md:left-1/2 md:-bottom-45 md:h-75 md:w-400 md:-translate-x-1/2"
      />
      <div aria-hidden className="absolute inset-0 bg-rays" />

      <div className="relative mx-auto flex min-h-24 max-w-3xl items-start justify-between gap-3 px-4 pt-5 pb-4 sm:px-6 md:min-h-30 md:pt-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-logo text-logo font-semibold text-white outline-none hover:opacity-88 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-violet md:gap-2.5"
        >
          <span className="size-4.5 rounded-logo bg-linear-to-b/srgb from-indigo to-accent-num md:size-5.5" />
          Личная CRM
        </Link>
        <Suspense>
          <AccountControls />
        </Suspense>
      </div>
    </header>
  );
}

async function AccountControls() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <form
      action="/login/logout"
      method="post"
      className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-sm text-white"
    >
      <span className="min-w-0 break-all">{user.email}</span>
      <button
        type="submit"
        className={buttonVariants({
          size: "sm",
          variant: "ghost",
          className: "bg-white/10 hover:bg-white/20 hover:text-white",
        })}
      >
        Выйти
      </button>
    </form>
  );
}
