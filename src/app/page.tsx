import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ContactList, ContactListSkeleton } from "@/components/contact-list";
import {
  ContactSearch,
  ContactSearchFallback,
} from "@/components/contact-search";
import {
  ReachOutSection,
  ReachOutSectionSkeleton,
} from "@/components/reach-out-section";
import { buttonVariants } from "@/components/ui/button";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title font-medium">Контакты</h1>

      {/* Stays on screen while the long list scrolls underneath */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Suspense fallback={<ContactSearchFallback />}>
          <ContactSearch />
        </Suspense>
        <Link
          href="/contacts/new"
          className={buttonVariants({ size: "lg", className: "max-sm:px-4" })}
        >
          <Plus />
          <span className="sm:hidden">Добавить</span>
          <span className="hidden sm:inline">Добавить контакт</span>
        </Link>
      </div>

      <Suspense fallback={<ReachOutSectionSkeleton />}>
        <ReachOutSection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<ContactListSkeleton />}>
        <ContactList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
