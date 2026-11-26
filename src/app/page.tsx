import { connection } from "next/server";
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
import { listGroups } from "@/lib/groups";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title font-medium">Контакты</h1>

      <Suspense fallback={<ContactSearchFallback />}>
        <ContactSearchWithGroups />
      </Suspense>

      <Suspense fallback={<ReachOutSectionSkeleton />}>
        <ReachOutSection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<ContactListSkeleton />}>
        <ContactList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ContactSearchWithGroups() {
  await connection();
  return <ContactSearch groups={await listGroups()} />;
}
