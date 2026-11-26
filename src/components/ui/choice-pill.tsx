import type { ComponentProps } from "react";

import { ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export const choicePillClassName =
  "h-auto min-h-10 max-w-full rounded-full border-border bg-card px-4 py-2 text-ink-2 wrap-anywhere whitespace-normal aria-pressed:border-primary aria-pressed:bg-primary/8 aria-pressed:text-primary data-disabled:opacity-50 max-sm:min-h-11 max-sm:text-base";

export function ChoicePill({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupItem>) {
  return (
    <ToggleGroupItem
      {...props}
      variant="outline"
      className={cn(choicePillClassName, className)}
    />
  );
}
