import Link from "next/link";
import { connection } from "next/server";

import { ContactCount } from "@/components/contact-count";
import { ContactRows } from "@/components/contact-rows";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { countContacts, findContactsByName } from "@/lib/contacts";
import { getContactFilterGroup } from "@/lib/groups";
import { contactListHref, firstValue } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { parseRecordId } from "@/lib/validation";

type SearchParams = PageProps<"/">["searchParams"];

export async function ContactList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const query = firstValue(params.q).trim();
  const addedId = parseRecordId(firstValue(params.added));
  const group = await getContactFilterGroup(params.group);

  const [contacts, total] = await Promise.all([
    findContactsByName(query, group ? { groupId: group.id } : undefined),
    countContacts(group?.id),
  ]);

  if (total === 0) {
    if (group) {
      return <EmptyState title="В группе пока нет участников" />;
    }
    return (
      <EmptyState
        title="Здесь пока никого нет"
        description="Добавьте первого человека — он появится в этом списке."
      >
        <Link href="/contacts/new" className={buttonVariants({ size: "lg" })}>
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
        {/* cn() lets the outline border win over the base transparent one */}
        <Link
          href={contactListHref("", group?.id)}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          {group ? "Сбросить поиск" : "Показать всех"}
        </Link>
      </EmptyState>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Список контактов">
      <ContactCount total={total} found={query ? contacts.length : undefined} />
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
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-dashed px-6 py-14 text-center">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-subtitle font-semibold text-balance">{title}</h2>
        {description && <p className="text-sm text-balance text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="divide-y divide-line-2 overflow-hidden rounded-card bg-card shadow-contact">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3 sm:px-5">
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
