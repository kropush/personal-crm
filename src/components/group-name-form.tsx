"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GroupFormState } from "@/lib/group-validation";

export function GroupNameForm({
  title,
  action,
  initialName,
  children,
}: {
  title: string;
  action: (state: GroupFormState, data: FormData) => Promise<GroupFormState>;
  initialName?: string;
  children?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const editing = initialName !== undefined;

  function close() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-title font-medium wrap-anywhere">{title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            ref={triggerRef}
            type="button"
            variant={editing ? "outline" : "default"}
            size="lg"
            className={editing ? "max-sm:size-10 max-sm:px-0" : undefined}
            aria-label={editing ? "Изменить группу" : undefined}
            aria-expanded={isOpen}
            aria-controls={isOpen ? formId : undefined}
            onClick={() => isOpen ? close() : setIsOpen(true)}
          >
            {editing ? (
              <>
                <Pencil />
                <span className="hidden sm:inline">Изменить</span>
              </>
            ) : (
              <>
                <Plus />
                Добавить группу
              </>
            )}
          </Button>
          {children}
        </div>
      </header>
      {isOpen && (
        <NameEditor
          id={formId}
          action={action}
          initialName={initialName ?? ""}
          submitLabel={editing ? "Сохранить" : "Создать группу"}
          onClose={close}
        />
      )}
    </>
  );
}

function NameEditor({
  id,
  action,
  initialName,
  submitLabel,
  onClose,
}: {
  id: string;
  action: (state: GroupFormState, data: FormData) => Promise<GroupFormState>;
  initialName: string;
  submitLabel: string;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (previous: GroupFormState, data: FormData) => {
      const result = await action(previous, data);
      if (!result.error) onClose();
      return result;
    },
    { name: initialName },
  );
  const inputId = `${id}-name`;
  const errorId = `${id}-error`;

  return (
    <form
      id={id}
      action={formAction}
      className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-contact sm:p-5"
    >
      <Label htmlFor={inputId}>Название группы</Label>
      <Input
        id={inputId}
        name="name"
        defaultValue={state.name}
        autoFocus
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? errorId : undefined}
      />
      {state.error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
