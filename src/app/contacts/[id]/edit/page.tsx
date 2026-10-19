import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact } from "@/lib/contacts";
import { parseContactId } from "@/lib/validation";

type Params = PageProps<"/contacts/[id]/edit">["params"];

async function loadContact(params: Params) {
  const { id } = await params;
  const contactId = parseContactId(id);
  return contactId ? getContact(contactId) : undefined;
}

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]/edit">): Promise<Metadata> {
  const contact = await loadContact(params);
  return {
    title: contact ? `Изменить: ${contact.name}` : "Контакт не найден",
  };
}

export default function EditContactPage({
  params,
}: PageProps<"/contacts/[id]/edit">) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<EditContactSkeleton />}>
        <EditContact params={params} />
      </Suspense>
    </main>
  );
}

async function EditContact({ params }: { params: Params }) {
  const contact = await loadContact(params);
  if (!contact) {
    notFound();
  }

  return (
    <>
      <BackLink href={`/contacts/${contact.id}`}>Назад к контакту</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">
        Изменить контакт
      </h1>
      <ContactForm
        contact={{
          id: contact.id,
          values: {
            name: contact.name,
            about: contact.about ?? "",
            howWeMet: contact.howWeMet ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
          },
        }}
      />
    </>
  );
}

function EditContactSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
