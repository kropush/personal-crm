import Link from "next/link";

// Small caps link in the style of the landing page labels
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2 rounded-sm font-mono text-label tracking-label text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-violet"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}
