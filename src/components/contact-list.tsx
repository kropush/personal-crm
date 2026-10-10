import Link from "next/link";

import { ContactRows } from "@/components/contact-rows";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { countContacts, findContactsByName } from "@/lib/contacts";
import { formatNumber, pluralize } from "@/lib/format";
import { parseContactId } from "@/lib/validation";

type SearchParams = PageProps<"/">["searchParams"];

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export async function ContactList({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = firstValue(params.q).trim();
  const addedId = parseContactId(firstValue(params.added));

  const [contacts, total] = await Promise.all([
    findContactsByName(query),
    countContacts(),
  ]);

  if (total === 0) {
    return (
      <EmptyState
        title="Здесь пока никого нет"
        description="Добавьте первого человека — он появится в этом списке."
      >
        <Link href="/contacts/new" className={buttonVariants()}>
          Добавить контакт
        </Link>
      </EmptyState>
    );
  }

  if (contacts.length === 0) {
    return (
      <EmptyState
        title="Никого не нашлось"
        description={`По запросу «${query}» нет контактов. Проверьте, нет ли опечатки в имени.`}
      >
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Показать всех
        </Link>
      </EmptyState>
    );
  }

  const contactForms = { one: "контакт", few: "контакта", many: "контактов" };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {query
          ? `Найдено: ${formatNumber(contacts.length)} из ${formatNumber(total)}`
          : `${formatNumber(total)} ${pluralize(total, contactForms)}`}
      </p>
      <ContactRows contacts={contacts} addedId={addedId} />
    </section>
  );
}

function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-balance text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

export function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-5 w-32" />
      <div className="divide-y overflow-hidden rounded-xl border">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
