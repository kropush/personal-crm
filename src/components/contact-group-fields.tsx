import { Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChoicePill, choicePillClassName } from "@/components/ui/choice-pill";
import { FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup } from "@/components/ui/toggle-group";
import type { Group } from "@/db/schema";
import { cn } from "@/lib/utils";
import type { ContactFormState } from "@/lib/validation";

export function ContactGroupFields({
  groups,
  state,
  disabled,
}: {
  groups: Group[];
  state: ContactFormState;
  disabled: boolean;
}) {
  const { values, fieldErrors } = state;
  const [selected, setSelected] = useState(values.groupIds);
  const [isAdding, setIsAdding] = useState(Boolean(values.newGroupName));
  const [draft, setDraft] = useState(values.newGroupName);
  const [newGroups, setNewGroups] = useState(values.newGroupNames);
  const availableIds = new Set(groups.map((group) => String(group.id)));
  const selectedIds = selected.filter((id) => availableIds.has(id));
  const addButton = useRef<HTMLButtonElement>(null);
  const editorId = useId();

  function closeEditor() {
    setIsAdding(false);
    setDraft("");
    addButton.current?.focus();
  }

  function addDraft() {
    const name = draft.trim();
    if (!name) return;
    setNewGroups((current) => [...current, name]);
    closeEditor();
  }

  function removeDraft(index: number) {
    setNewGroups((current) => current.filter((_, position) => position !== index));
  }

  return (
    <FieldSet
      disabled={disabled}
      aria-describedby={fieldErrors.groupIds ? "contact-groups-error" : undefined}
    >
      <FieldLegend>Группы</FieldLegend>
      <div className="flex flex-wrap items-center gap-2">
        {groups.length > 0 && (
          <ToggleGroup
            multiple
            aria-label="Выбрать группы"
            value={selectedIds}
            onValueChange={setSelected}
            disabled={disabled}
            className="max-w-full flex-wrap"
          >
            {groups.map((group) => (
              <ChoicePill key={group.id} value={String(group.id)}>
                {group.name}
              </ChoicePill>
            ))}
          </ToggleGroup>
        )}
        {selectedIds.map((id) => (
          <input key={id} type="hidden" name="groupIds" value={id} />
        ))}
        {newGroups.map((name, index) => (
          <div key={`${index}:${name}`} className="max-w-full">
            <input type="hidden" name="newGroupNames" value={name} />
            <Button
              type="button"
              variant="outline"
              className={cn(choicePillClassName, "border-primary bg-primary/8 text-primary")}
              aria-label={`Убрать новую группу «${name}»`}
              onClick={() => removeDraft(index)}
            >
              <span className="min-w-0 wrap-anywhere">{name}</span>
              <X />
            </Button>
          </div>
        ))}
        <Button
          ref={addButton}
          type="button"
          variant="outline"
          className={choicePillClassName}
          aria-expanded={isAdding}
          aria-controls={isAdding ? editorId : undefined}
          onClick={() => (isAdding ? closeEditor() : setIsAdding(true))}
        >
          <Plus />
          Добавить группу
        </Button>
      </div>
      <FieldError id="contact-groups-error">{fieldErrors.groupIds}</FieldError>
      {isAdding && (
        <div id={editorId} className="flex flex-col gap-2">
          <FieldLabel htmlFor="new-group-name">Название новой группы</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="new-group-name"
              name="newGroupName"
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addDraft();
                }
              }}
              aria-invalid={Boolean(fieldErrors.newGroupName)}
              aria-describedby={fieldErrors.newGroupName ? "new-group-error" : undefined}
              className="min-w-0 flex-1"
            />
            <Button type="button" variant="outline" onClick={addDraft} disabled={!draft.trim()}>
              Добавить
            </Button>
          </div>
          <FieldError id="new-group-error">{fieldErrors.newGroupName}</FieldError>
        </div>
      )}
    </FieldSet>
  );
}
