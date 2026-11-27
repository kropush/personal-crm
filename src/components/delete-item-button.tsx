"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useActionState } from "react";

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
import type { DeleteFormState } from "@/lib/validation";

const initialState: DeleteFormState = {};

type DeleteItemProps = {
  action: (state: DeleteFormState, data: FormData) => Promise<DeleteFormState>;
  title: string;
  description: string;
};

export function DeleteItemButton({
  action,
  label,
  title,
  description,
}: {
  label: string;
} & DeleteItemProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={label}
            className="hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        {/* Mounted anew on every opening, so an old error is not shown again */}
        <DeleteItemForm action={action} title={title} description={description} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteItemForm({ action, title, description }: DeleteItemProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    // contents: the dialog lays out the header, error and buttons itself
    <form action={formAction} className="contents">
      <AlertDialogHeader>
        <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
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
          name="confirmation"
          value="delete"
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
