"use client";

import { Check, ChevronDown, ListFilter, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { Group } from "@/db/schema";
import { cn } from "@/lib/utils";

const ALL_GROUPS_LABEL = "Все группы";
const toolbarButtonClassName = "max-sm:h-11 max-sm:px-3";

function normalize(value: string) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function ContactGroupFilter({
  groups,
  value = "",
  onChange,
  disabled,
}: {
  groups: Group[];
  value?: string;
  onChange?: (group: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const label = groups.find((group) => String(group.id) === value)?.name
    ?? ALL_GROUPS_LABEL;
  const search = normalize(query.trim());
  const matches = groups.filter((group) => normalize(group.name).includes(search));
  const options = [
    { id: "", name: ALL_GROUPS_LABEL },
    ...matches.map((group) => ({ id: String(group.id), name: group.name })),
  ];

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function toggle() {
    if (open) {
      close();
    } else {
      setQuery("");
      setOpen(true);
    }
  }

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled}
          aria-label={`Фильтр по группе: ${label}`}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className={cn(
            toolbarButtonClassName,
            "min-w-0 shrink aria-expanded:border-primary aria-expanded:bg-primary/8 aria-expanded:text-primary",
          )}
          onClick={toggle}
        >
          <ListFilter />
          <span className="truncate">{label}</span>
          <ChevronDown className={cn(open && "rotate-180")} />
        </Button>
        <Link
          href="/groups"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: toolbarButtonClassName,
          })}
        >
          <UsersRound />
          Список групп
        </Link>
      </div>

      {open && (
        <div
          id={panelId}
          className="flex flex-col gap-2 rounded-card border bg-card p-3 shadow-contact"
        >
          <InputGroup className="rounded-full bg-card">
            <InputGroupAddon className="pl-3.5"><Search /></InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти группу"
              aria-label="Найти группу"
              autoComplete="off"
              autoFocus
            />
          </InputGroup>
          <ul aria-label="Доступные группы" className="flex max-h-52 flex-col gap-1 overflow-y-auto p-1">
            {options.map((option) => (
              <li key={option.id}>
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={value === option.id}
                  className="h-auto min-h-9 w-full justify-between rounded-lg text-left wrap-anywhere whitespace-normal aria-pressed:bg-primary/8 aria-pressed:text-primary max-sm:min-h-11"
                  onClick={() => {
                    close();
                    onChange?.(option.id);
                  }}
                >
                  {option.name}
                  {value === option.id && <Check />}
                </Button>
              </li>
            ))}
          </ul>
          {search && matches.length === 0 && (
            <p role="status" className="px-2 text-sm text-muted-foreground">
              Групп с таким названием нет.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
