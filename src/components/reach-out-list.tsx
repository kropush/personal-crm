"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
import { Button } from "@/components/ui/button";
import {
  useContactedMarks,
  type ContactedMarkState,
} from "@/hooks/use-contacted-marks";
import type { ReachOutItem } from "@/lib/contacts";
import { FREQUENCY_LABELS, formatNumber, formatOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";

const VISIBLE_COUNT = 5;

// A Client Component: "Показать всех" opens the rest in place, and a row
// stays in the block while its "Связался" can still be undone
export function ReachOutList({ contacts }: { contacts: ReachOutItem[] }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  // Rows whose undo window is over leave at once, before the server sends
  // the block without them. A fresh list from the server has none of them.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(new Set());
  const [seenContacts, setSeenContacts] = useState(contacts);
  if (contacts !== seenContacts) {
    setSeenContacts(contacts);
    setHiddenIds(new Set());
  }

  const marks = useContactedMarks({
    onUndoWindowEnd: (contactId) =>
      setHiddenIds((previous) => new Set(previous).add(contactId)),
  });

  // Brings the block from the server once no row can be undone any more:
  // an earlier refresh would take away the rows that still offer "Отменить"
  useEffect(() => {
    if (!marks.isBusy && hiddenIds.size > 0) {
      router.refresh();
    }
  }, [marks.isBusy, hiddenIds, router]);

  const visibleContacts = contacts.filter(
    (contact) => !hiddenIds.has(contact.id),
  );
  if (visibleContacts.length === 0) {
    return null;
  }
  const shownContacts = isExpanded
    ? visibleContacts
    : visibleContacts.slice(0, VISIBLE_COUNT);

  return (
    <section aria-labelledby="reach-out-title" className="mb-4 flex flex-col gap-3">
      <h2
        id="reach-out-title"
        className="font-mono text-label tracking-label text-muted-foreground uppercase"
      >
        Пора связаться · {formatNumber(visibleContacts.length)}
      </h2>

      <div className="overflow-hidden rounded-card bg-card shadow-contact">
        <ul className="divide-y divide-line-2">
          {shownContacts.map((contact) => (
            <ReachOutRow
              key={contact.id}
              contact={contact}
              state={marks.getState(contact.id)}
              onMark={() => marks.markContacted(contact.id)}
              onUndo={() => marks.undo(contact.id)}
            />
          ))}
        </ul>

        {visibleContacts.length > VISIBLE_COUNT && (
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-12 w-full items-center justify-center gap-1.5 border-t border-line-2 text-sm font-medium text-ink-2 outline-none hover:bg-muted focus-visible:bg-muted"
          >
            {isExpanded
              ? "Свернуть"
              : `Показать всех (${formatNumber(visibleContacts.length)})`}
            <ChevronDown
              aria-hidden
              className={cn("size-4", isExpanded && "rotate-180")}
            />
          </button>
        )}
      </div>
    </section>
  );
}

function ReachOutRow({
  contact,
  state,
  onMark,
  onUndo,
}: {
  contact: ReachOutItem;
  state: ContactedMarkState;
  onMark: () => void;
  onUndo: () => void;
}) {
  const isMarked = state.mark !== undefined;

  return (
    <li
      className={cn(
        "relative flex items-center gap-3 px-4 py-3 has-[a:focus-visible]:bg-muted has-[a:hover]:bg-muted sm:px-5",
        isMarked &&
          "bg-violet/6 has-[a:focus-visible]:bg-violet/10 has-[a:hover]:bg-violet/10",
      )}
    >
      {/* The link stretches over the whole row; the button sits next to it,
          above the stretched part, so pressing it does not open the card */}
      <Link
        href={`/contacts/${contact.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 outline-none after:absolute after:inset-0"
      >
        <ContactAvatar name={contact.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{contact.name}</div>
          {isMarked ? (
            <div className="flex items-center gap-1 text-sm text-ink-2">
              <Check className="size-4 text-online" />
              Отмечено
            </div>
          ) : state.error ? (
            <div role="alert" className="text-sm text-destructive">
              {state.error}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground sm:truncate">
              {FREQUENCY_LABELS[contact.frequency]} ·{" "}
              <span
                className={
                  contact.overdueDays > 0
                    ? "text-destructive"
                    : "font-medium text-foreground"
                }
              >
                {formatOverdue(contact.overdueDays)}
              </span>
            </div>
          )}
        </div>
      </Link>

      {isMarked ? (
        <Button
          variant="ghost"
          aria-label={`Отменить отметку: ${contact.name}`}
          disabled={state.isSaving}
          onClick={onUndo}
          className="relative px-3.5 text-primary hover:text-primary max-sm:h-11 max-sm:px-3 max-sm:text-base"
        >
          Отменить
        </Button>
      ) : (
        <Button
          variant="outline"
          aria-label={`Связался: ${contact.name}`}
          disabled={state.isSaving}
          onClick={onMark}
          className="relative px-3.5 max-sm:h-11 max-sm:text-base"
        >
          <Check className="max-sm:hidden" />
          Связался
        </Button>
      )}
    </li>
  );
}
