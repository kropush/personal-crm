import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="text-title font-medium">Новый контакт</h1>
      <Suspense fallback={<Skeleton className="h-56 rounded-card" />}>
        <NewContactForm />
      </Suspense>
    </main>
  );
}

async function NewContactForm() {
  await connection();
  const { id: ownerId } = await requireUser();
  return <ContactForm groups={await listGroups(ownerId)} />;
}
