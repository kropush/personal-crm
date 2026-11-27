import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { GroupNameForm } from "@/components/group-name-form";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";

import { createGroupAction } from "./actions";

export const metadata: Metadata = { title: "Группы" };

export default function GroupsPage() {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/">Контакты</BackLink>
      <GroupNameForm title="Группы" action={createGroupAction} />
      <Suspense fallback={<Skeleton className="h-12 rounded-card" />}>
        <GroupList />
      </Suspense>
    </main>
  );
}

async function GroupList() {
  await connection();
  const { id: ownerId } = await requireUser();
  const groups = await listGroups(ownerId);

  if (groups.length === 0) {
    return (
      <p className="rounded-card border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Групп пока нет.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line-2 overflow-hidden rounded-card bg-card shadow-contact">
      {groups.map((group) => (
        <li key={group.id}>
          <Link
            href={`/groups/${group.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 font-medium outline-none hover:bg-muted focus-visible:bg-muted sm:px-5"
          >
            <span className="min-w-0 wrap-anywhere">{group.name}</span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
