import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactCount } from "@/components/contact-count";
import { ContactRows } from "@/components/contact-rows";
import { DeleteItemButton } from "@/components/delete-item-button";
import { GroupMemberSearch } from "@/components/group-member-search";
import { GroupMembershipButton } from "@/components/group-membership-button";
import { GroupNameForm } from "@/components/group-name-form";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findContactsByName, type ContactListItem } from "@/lib/contacts";
import { getGroup } from "@/lib/groups";
import { firstValue } from "@/lib/search-params";
import { requireUser } from "@/lib/session";
import { parseRecordId } from "@/lib/validation";

import {
  addGroupMemberAction,
  deleteGroupAction,
  removeGroupMemberAction,
  renameGroupAction,
} from "../actions";

type GroupPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

async function loadGroup(params: GroupPageProps["params"], ownerId: string) {
  const groupId = parseRecordId((await params).id);
  return groupId === null ? undefined : getGroup(ownerId, groupId);
}

export async function generateMetadata({ params }: GroupPageProps): Promise<Metadata> {
  const { id: ownerId } = await requireUser();
  return { title: (await loadGroup(params, ownerId))?.name ?? "Группа не найдена" };
}

export default function GroupPage({ params, searchParams }: GroupPageProps) {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/groups">Все группы</BackLink>
      <Suspense fallback={<Skeleton className="h-24 rounded-card" />}>
        <GroupDetails params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function GroupDetails({ params, searchParams }: GroupPageProps) {
  const { id: ownerId } = await requireUser();
  const group = await loadGroup(params, ownerId);
  if (!group) notFound();
  const search = (await searchParams).q;
  const query = firstValue(search).trim();
  const [members, candidates] = await Promise.all([
    findContactsByName(ownerId, "", { groupId: group.id }),
    query ? findContactsByName(ownerId, query, { groupId: group.id, exclude: true }) : [],
  ]);

  return (
    <>
      <GroupNameForm
        title={group.name}
        action={renameGroupAction.bind(null, group.id)}
        initialName={group.name}
      >
        <DeleteItemButton
          action={deleteGroupAction.bind(null, group.id)}
          label="Удалить группу"
          title={`Удалить группу «${group.name}»?`}
          description="Группа исчезнет у участников. Контакты, их заметки и другие группы сохранятся."
        />
      </GroupNameForm>
      <details key={search === undefined ? "closed" : "search"} open={search !== undefined}>
        <summary
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          })}
        >
          <UserPlus />
          Добавить участника
        </summary>
        <GroupMemberSearch groupId={group.id} query={query}>
          {query && (
            <section className="flex flex-col gap-3" aria-labelledby="candidates-heading">
              <h2 id="candidates-heading" className="font-semibold">
                Контакты для добавления
              </h2>
              {candidates.length ? (
                <GroupContactRows contacts={candidates} groupId={group.id} operation="add" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Подходящих контактов для добавления нет.
                </p>
              )}
            </section>
          )}
        </GroupMemberSearch>
      </details>
      <section className="flex flex-col gap-3" aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-subtitle font-semibold">
          Участники
        </h2>
        <ContactCount total={members.length} />
        {members.length ? (
          <GroupContactRows contacts={members} groupId={group.id} operation="remove" />
        ) : (
          <p className="rounded-card border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Участников пока нет.
          </p>
        )}
      </section>
    </>
  );
}

function GroupContactRows({
  contacts,
  groupId,
  operation,
}: {
  contacts: ContactListItem[];
  groupId: number;
  operation: "add" | "remove";
}) {
  const action = operation === "add" ? addGroupMemberAction : removeGroupMemberAction;
  return (
    <ContactRows
      contacts={contacts}
      addedId={null}
      showContactDetails={operation === "add"}
      actions={Object.fromEntries(
        contacts.map((contact) => [
          contact.id,
          <GroupMembershipButton
            key={contact.id}
            action={action.bind(null, groupId, contact.id)}
            operation={operation}
          />,
        ]),
      )}
    />
  );
}
