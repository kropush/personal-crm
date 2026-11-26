"use client";

import { Search, X } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export function GroupMemberSearch({
  groupId,
  query,
  children,
}: {
  groupId: number;
  query: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const path = `/groups/${groupId}`;
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState({ query, value: query, clearing: false });

  if (query !== search.query) {
    setSearch({
      query,
      // A user can start typing again before the cleared URL finishes loading.
      value: search.clearing && !query ? search.value : query,
      clearing: false,
    });
  }

  const showResults = Boolean(query) && !search.clearing;

  function clear() {
    setSearch({ query, value: "", clearing: Boolean(query) });
    // Keep the search area open while dropping the previous results.
    if (query) router.replace(`${path}?q=`, { scroll: false });
    input.current?.focus();
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-card border bg-muted p-3 sm:p-4">
      <Form action={path} className="flex items-center gap-2">
        <InputGroup className="h-10 min-w-0 flex-1 rounded-full bg-card shadow-contact">
          <InputGroupAddon className="pl-3.5"><Search /></InputGroupAddon>
          <InputGroupInput
            ref={input}
            name="q"
            type="text"
            role="searchbox"
            inputMode="search"
            enterKeyHint="search"
            value={search.value}
            autoComplete="off"
            aria-label="Найти контакт по имени"
            placeholder="Найти по имени"
            onChange={(event) => {
              const value = event.target.value;
              setSearch((previous) => ({ ...previous, value }));
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && (search.value || showResults)) {
                event.preventDefault();
                clear();
              }
            }}
          />
          {(search.value || showResults) && (
            <InputGroupAddon align="inline-end" className="pr-2.5">
              <InputGroupButton
                size="icon-xs"
                className="rounded-full"
                aria-label="Очистить поиск участников"
                onClick={clear}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Button type="submit" variant="outline" size="lg">Найти</Button>
      </Form>
      {showResults && children}
    </div>
  );
}
