import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { NoteForm } from "@/components/note-form";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, getNotes } from "@/lib/contacts";
import { formatDateTime, getPhoneHref } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseContactId } from "@/lib/validation";

type Params = PageProps<"/contacts/[id]">["params"];

async function loadContact(params: Params) {
  const { id } = await params;
  const contactId = parseContactId(id);
  return contactId ? getContact(contactId) : undefined;
}

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const contact = await loadContact(params);
  return { title: contact?.name ?? "Контакт не найден" };
}

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <Suspense fallback={<ContactCardSkeleton />}>
        <ContactCard params={params} />
      </Suspense>
    </main>
  );
}

async function ContactCard({ params }: { params: Params }) {
  const contact = await loadContact(params);
  if (!contact) {
    notFound();
  }
  const notes = await getNotes(contact.id);
  const phoneHref = contact.phone ? getPhoneHref(contact.phone) : null;

  return (
    <>
      <header className="flex items-center gap-4">
        <ContactAvatar name={contact.name} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {contact.name}
          </h1>
          {contact.about && (
            <p className="break-words text-muted-foreground">{contact.about}</p>
          )}
        </div>
        <Link
          href={`/contacts/${contact.id}/edit`}
          aria-label="Изменить контакт"
          // cn() lets the outline border win over the base transparent one
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "px-2.5 sm:px-3.5",
          )}
        >
          <Pencil />
          {/* Icon only on phones, so the name keeps the room it needs */}
          <span className="hidden sm:inline">Изменить</span>
        </Link>
      </header>

      {(contact.howWeMet || contact.phone || contact.email) && (
        <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 text-sm sm:grid-cols-[10rem_1fr] sm:p-5">
          {contact.howWeMet && (
            <Detail label="Откуда знакомы">
              <span className="whitespace-pre-wrap">{contact.howWeMet}</span>
            </Detail>
          )}
          {contact.phone && (
            <Detail label="Телефон">
              {phoneHref ? (
                <a href={phoneHref} className="underline-offset-4 hover:underline">
                  {contact.phone}
                </a>
              ) : (
                contact.phone
              )}
            </Detail>
          )}
          {contact.email && (
            <Detail label="Почта">
              <a
                href={`mailto:${contact.email}`}
                className="underline-offset-4 hover:underline"
              >
                {contact.email}
              </a>
            </Detail>
          )}
        </dl>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Заметки</h2>
        <NoteForm contactId={contact.id} />

        {notes.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Заметок пока нет. Запишите первую после разговора.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border p-4">
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {note.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ContactCardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg sm:w-28" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
