import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/format";

export function ContactAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-135/srgb from-violet to-coral text-sm font-semibold text-white select-none",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
