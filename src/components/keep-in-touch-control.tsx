"use client";

import { AlarmClock, Calendar, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { setKeepInTouchFrequencyAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { KeepInTouchFrequency } from "@/db/keep-in-touch";
import { useContactedMarks } from "@/hooks/use-contacted-marks";
import type { KeepInTouchStatus } from "@/lib/contacts";
import {
  FREQUENCY_SHORT_LABELS,
  NO_FREQUENCY_LABEL,
  formatDueDate,
  formatOverdue,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { SAVE_FAILED_MESSAGE } from "@/lib/validation";

// The switch needs a value for "Не задано" too
const NONE = "none";
type Option = KeepInTouchFrequency | typeof NONE;

const OPTIONS: { value: Option; label: string }[] = [
  { value: NONE, label: NO_FREQUENCY_LABEL },
  ...Object.entries(FREQUENCY_SHORT_LABELS).map(([value, label]) => ({
    value: value as KeepInTouchFrequency,
    label,
  })),
];

export function KeepInTouchControl({
  contactId,
  status,
}: {
  contactId: number;
  status: KeepInTouchStatus;
}) {
  const router = useRouter();

  // The new choice shows while it is being saved; a failed save brings back
  // the previous one when the transition ends
  const [frequency, setOptimisticFrequency] = useOptimistic(status.frequency);
  const [isSavingFrequency, startSavingFrequency] = useTransition();
  const [frequencyError, setFrequencyError] = useState<string>();

  const marks = useContactedMarks({
    // The countdown restarts from today, or goes back after the undo
    onMarked: () => router.refresh(),
    onUndone: () => router.refresh(),
  });
  const markState = marks.getState(contactId);

  function choose(next: KeepInTouchFrequency | null) {
    setFrequencyError(undefined);
    startSavingFrequency(async () => {
      setOptimisticFrequency(next);
      const result = await setKeepInTouchFrequencyAction(contactId, next).catch(
        (error: unknown) => {
          console.error("Failed to send the frequency", error);
          return { error: SAVE_FAILED_MESSAGE };
        },
      );
      if (result.error) {
        const { error } = result;
        startSavingFrequency(() => setFrequencyError(error));
      }
    });
  }

  const due =
    status.frequency !== null &&
    status.dueDate !== null &&
    status.overdueDays !== null
      ? {
          dueDate: status.dueDate,
          overdueDays: status.overdueDays,
          currentYear: status.currentYear,
        }
      : null;

  return (
    <section
      aria-labelledby="keep-in-touch-title"
      className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-contact sm:p-5"
    >
      <h2 id="keep-in-touch-title" className="font-semibold">
        Как часто общаться
      </h2>

      <ToggleGroup
        aria-labelledby="keep-in-touch-title"
        value={[frequency ?? NONE]}
        // Pressing the chosen button again unpresses it: that is ignored,
        // exactly one option is always chosen
        onValueChange={([next]) => {
          if (next) choose(next === NONE ? null : (next as KeepInTouchFrequency));
        }}
        disabled={isSavingFrequency}
        className="flex-wrap"
      >
        {OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            variant="outline"
            className="h-10 rounded-full border-border bg-card px-4 text-ink-2 aria-pressed:border-primary aria-pressed:bg-primary/8 aria-pressed:text-primary data-disabled:opacity-50 max-sm:h-11 max-sm:text-base"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {frequencyError ? (
        <p role="alert" className="text-sm text-destructive">
          {frequencyError}
        </p>
      ) : (
        due && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <DueLine
              {...due}
              className={cn(isSavingFrequency && "opacity-50")}
            />

            <div aria-live="polite">
              {markState.mark ? (
                <span className="inline-flex items-center gap-1 text-sm text-ink-2 max-sm:text-base">
                  <Check className="size-4 text-online" />
                  Отмечено
                  <Button
                    variant="ghost"
                    className="px-2.5 text-primary hover:text-primary max-sm:h-11 max-sm:px-3 max-sm:text-base"
                    onClick={() => marks.undo(contactId)}
                  >
                    Отменить
                  </Button>
                </span>
              ) : (
                <Button
                  variant="outline"
                  className="px-3.5 max-sm:h-11 max-sm:px-4 max-sm:text-base"
                  disabled={markState.isSaving || isSavingFrequency}
                  onClick={() => marks.markContacted(contactId)}
                >
                  <Check />
                  Связался
                </Button>
              )}
            </div>
          </div>
        )
      )}

      {due && markState.error && !frequencyError && (
        <p role="alert" className="text-sm text-destructive">
          {markState.error}
        </p>
      )}
    </section>
  );
}

// "Следующий раз — 28 ноября", "Пора связаться — сегодня",
// "Пора связаться — просрочено на 5 дней"
function DueLine({
  dueDate,
  overdueDays,
  currentYear,
  className,
}: {
  dueDate: string;
  overdueDays: number;
  currentYear: number;
  className?: string;
}) {
  const isAhead = overdueDays < 0;
  const isOverdue = overdueDays > 0;
  const Icon = isAhead ? Calendar : AlarmClock;

  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm text-muted-foreground sm:items-center",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0 sm:mt-0",
          !isAhead && (isOverdue ? "text-destructive" : "text-foreground"),
        )}
      />
      <span>
        <span className={cn("font-medium", !isAhead && "text-foreground")}>
          {isAhead ? "Следующий раз" : "Пора связаться"}
        </span>
        {" — "}
        <span
          className={cn(
            isAhead
              ? "text-ink-2"
              : cn("font-medium", isOverdue ? "text-destructive" : "text-foreground"),
          )}
        >
          {isAhead
            ? formatDueDate(dueDate, currentYear)
            : formatOverdue(overdueDays)}
        </span>
      </span>
    </p>
  );
}
