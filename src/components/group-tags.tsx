import Link from "next/link";

import { cn } from "@/lib/utils";

export function GroupTags({
  groups,
  className,
  large = false,
}: {
  groups: { id?: number; name: string }[];
  className?: string;
  large?: boolean;
}) {
  if (groups.length === 0) return null;

  const tagClassName = cn(
    "rounded-full bg-muted text-muted-foreground wrap-anywhere",
    large
      ? "inline-flex min-h-10 max-w-full items-center px-4 py-2 text-sm font-medium max-sm:min-h-11 max-sm:text-base"
      : "block px-2 py-0.5 text-xs",
  );

  return (
    <ul aria-label="Группы" className={cn("flex flex-wrap", large ? "gap-2" : "gap-1", className)}>
      {groups.map((group, index) => (
        <li key={group.id ?? index} className="max-w-full">
          {group.id === undefined ? (
            <span className={tagClassName}>{group.name}</span>
          ) : (
            <Link
              href={`/groups/${group.id}`}
              className={cn(
                tagClassName,
                "hover:bg-primary/8 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring",
              )}
            >
              {group.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
