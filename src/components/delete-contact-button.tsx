"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useActionState } from "react";

import { deleteContactAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { DeleteContactState } from "@/lib/validation";

const initialState: DeleteContactState = {};

export function DeleteContactButton({
  contactId,
  contactName,
}: {
  contactId: number;
  contactName: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Удалить контакт"
            className="hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        {/* Mounted anew on every opening, so an old error is not shown again */}
        <DeleteContactForm contactId={contactId} contactName={contactName} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteContactForm({
  contactId,
  contactName,
}: {
  contactId: number;
  contactName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteContactAction.bind(null, contactId),
    initialState,
  );

  return (
    // contents: the dialog lays out the header, error and buttons itself
    <form action={formAction} className="contents">
      <AlertDialogHeader>
        <AlertDialogTitle className="break-words">
          Удалить контакт «{contactName}»?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Вместе с контактом удалятся все его заметки. Вернуть не получится.
        </AlertDialogDescription>
      </AlertDialogHeader>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel size="lg" disabled={isPending}>
          Отмена
        </AlertDialogCancel>
        <AlertDialogAction
          type="submit"
          variant="destructive"
          size="lg"
          disabled={isPending}
        >
          {isPending && <LoaderCircle className="animate-spin" />}
          Удалить
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  );
}
