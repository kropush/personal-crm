import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { markContactedAction, undoMarkContactedAction } from "@/app/actions";
import { SAVE_FAILED_MESSAGE } from "@/lib/validation";

// How long "Отменить" stays after "Связался", in the card and in the block
export const UNDO_WINDOW_MS = 5000;

type Mark = { markedAt: string; previous: string | null };

export type ContactedMarkState = {
  // A request is on its way: the buttons wait for it
  isSaving: boolean;
  // Saved and can still be undone until undoUntil (Date.now() milliseconds)
  mark?: Mark;
  undoUntil?: number;
  error?: string;
};

const IDLE: ContactedMarkState = { isSaving: false };

// "Связался" for one or several contacts. The mark is saved at once and can be
// undone for UNDO_WINDOW_MS. The callbacks let the page decide when to refresh.
export function useContactedMarks({
  onMarked,
  onUndone,
  onUndoWindowEnd,
}: {
  onMarked?: (contactId: number) => void;
  onUndone?: (contactId: number) => void;
  onUndoWindowEnd?: (contactId: number) => void;
}) {
  const [states, setStates] = useState<Record<number, ContactedMarkState>>(
    {},
  );

  function setState(contactId: number, state: ContactedMarkState) {
    setStates((previous) => ({ ...previous, [contactId]: state }));
  }

  const closeUndoWindow = useEffectEvent((contactId: number) => {
    setState(contactId, IDLE);
    onUndoWindowEnd?.(contactId);
  });

  // Timers follow the state, not the clicks: Next.js keeps a page's state
  // when you go to another page and back, but stops its effects meanwhile.
  // On the way back a window that is already over closes at once.
  useEffect(() => {
    const timers = Object.entries(states).flatMap(([id, state]) =>
      state.undoUntil === undefined
        ? []
        : [
            setTimeout(
              () => closeUndoWindow(Number(id)),
              Math.max(0, state.undoUntil - Date.now()),
            ),
          ],
    );
    return () => timers.forEach(clearTimeout);
  }, [states]);

  async function markContacted(contactId: number) {
    setState(contactId, { isSaving: true });

    const result = await markContactedAction(contactId).catch(
      (error: unknown) => {
        console.error("Failed to send the contacted mark", error);
        return { error: SAVE_FAILED_MESSAGE };
      },
    );
    if (result.error !== undefined) {
      setState(contactId, { isSaving: false, error: result.error });
      return;
    }

    const mark = { markedAt: result.markedAt, previous: result.previous };
    const undoUntil = Date.now() + UNDO_WINDOW_MS;
    // One transition: "Отмечено" shows up together with what onMarked refreshes
    startTransition(() => {
      setState(contactId, { isSaving: false, mark, undoUntil });
      onMarked?.(contactId);
    });
  }

  async function undo(contactId: number) {
    const mark = states[contactId]?.mark;
    if (!mark) return;
    setState(contactId, { isSaving: true });

    const result = await undoMarkContactedAction(
      contactId,
      mark.markedAt,
      mark.previous,
    ).catch((error: unknown) => {
      console.error("Failed to send the undo of the contacted mark", error);
      return { error: SAVE_FAILED_MESSAGE };
    });
    if (result.error !== undefined) {
      setState(contactId, { isSaving: false, error: result.error });
      return;
    }

    startTransition(() => {
      setState(contactId, IDLE);
      onUndone?.(contactId);
    });
  }

  return {
    getState: (contactId: number) => states[contactId] ?? IDLE,
    // Some contact is being saved or can still be undone
    isBusy: Object.values(states).some(
      (state) => state.isSaving || state.mark !== undefined,
    ),
    markContacted,
    undo,
  };
}
