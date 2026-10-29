import { firstValue } from "@/components/contact-list";
import { ReachOutList } from "@/components/reach-out-list";
import { Skeleton } from "@/components/ui/skeleton";
import { findContactsToReachOut } from "@/lib/contacts";

type SearchParams = PageProps<"/">["searchParams"];

// The "Пора связаться" block. Not shown while searching or when nobody is due
export async function ReachOutSection({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  if (firstValue(params.q).trim()) {
    return null;
  }

  const contacts = await findContactsToReachOut();
  if (contacts.length === 0) {
    return null;
  }

  return <ReachOutList contacts={contacts} />;
}

const SKELETON_ROWS = [
  { name: "w-44", details: "w-58" },
  { name: "w-36", details: "w-52" },
  { name: "w-48", details: "w-62" },
];

export function ReachOutSectionSkeleton() {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <div className="divide-y divide-line-2 overflow-hidden rounded-card bg-card shadow-contact">
        {SKELETON_ROWS.map((row, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className={`h-4 ${row.name}`} />
              <Skeleton className={`h-3.5 max-w-full ${row.details}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
