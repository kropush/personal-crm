import Link from "next/link";

// Dark band with the "sunrise" glow and rays, a short version of the landing page hero
export function AppHeader() {
  return (
    <header className="relative overflow-hidden bg-night">
      <div
        aria-hidden
        className="absolute -inset-x-15 -bottom-30 h-50 rounded-full bg-sunrise md:inset-x-auto md:left-1/2 md:-bottom-45 md:h-75 md:w-400 md:-translate-x-1/2"
      />
      <div aria-hidden className="absolute inset-0 bg-rays" />

      <div className="relative mx-auto flex h-24 max-w-3xl items-start px-4 pt-5 sm:px-6 md:h-30 md:pt-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-logo text-logo font-semibold text-white outline-none hover:opacity-88 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-violet md:gap-2.5"
        >
          <span className="size-4.5 rounded-logo bg-linear-to-b/srgb from-indigo to-accent-num md:size-5.5" />
          Личная CRM
        </Link>
      </div>
    </header>
  );
}
