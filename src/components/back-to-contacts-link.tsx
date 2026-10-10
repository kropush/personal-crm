import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackToContactsLink() {
  return (
    <Link
      href="/"
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" />
      Все контакты
    </Link>
  );
}
