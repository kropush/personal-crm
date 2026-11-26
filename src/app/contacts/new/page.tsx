import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroups } from "@/lib/groups";

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
  return <ContactForm groups={await listGroups()} />;
}
