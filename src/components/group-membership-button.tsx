"use client";

import { UserMinus, UserPlus } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { GroupMembershipState } from "@/lib/group-validation";

export function GroupMembershipButton({
  action,
  operation,
}: {
  action: (state: GroupMembershipState) => Promise<GroupMembershipState>;
  operation: "add" | "remove";
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const label = operation === "add" ? "Добавить" : "Убрать из группы";
  const Icon = operation === "add" ? UserPlus : UserMinus;

  return (
    <form action={formAction} className="relative flex max-w-1/2 flex-col items-end gap-1">
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isPending}
        aria-label={label}
        className="max-sm:size-10 max-sm:rounded-full max-sm:p-0"
      >
        <Icon className="size-4 sm:hidden" />
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {state.error && (
        <p role="alert" className="text-right text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
