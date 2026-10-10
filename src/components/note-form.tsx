"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { addNoteAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX_LENGTH, type NoteFormState } from "@/lib/validation";

const initialState: NoteFormState = { body: "", savedCount: 0 };

export function NoteForm({ contactId }: { contactId: number }) {
  const [state, formAction, isPending] = useActionState(
    addNoteAction.bind(null, contactId),
    initialState,
  );
  // The "saved" confirmation disappears once the user starts the next note
  const [dismissedSaves, setDismissedSaves] = useState(0);
  const isJustSaved = !state.error && state.savedCount > dismissedSaves;

  return (
    // An empty note is rejected on the server, so the message is in Russian
    // and looks the same in any browser
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <Textarea
        name="body"
        // A failed save returns the text, a successful one clears the field
        defaultValue={state.body}
        maxLength={NOTE_MAX_LENGTH}
        required
        rows={3}
        className="min-h-24"
        placeholder="О чём поговорили и о чём договорились"
        aria-label="Новая заметка"
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "note-error" : undefined}
        onChange={() => setDismissedSaves(state.savedCount)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="px-3.5" disabled={isPending}>
          {isPending && <LoaderCircle className="animate-spin" />}
          Сохранить заметку
        </Button>

        <p className="text-sm" aria-live="polite">
          {state.error ? (
            <span id="note-error" className="text-destructive">
              {state.error}
            </span>
          ) : isJustSaved ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Check className="size-4" />
              Заметка сохранена
            </span>
          ) : (
            <span className="hidden text-muted-foreground sm:inline">
              Ctrl + Enter — сохранить
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
