"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const SEARCH_DELAY_MS = 200;

export function ContactSearch() {
  const router = useRouter();
  const urlQuery = useSearchParams().get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const [requestedQuery, setRequestedQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can also change without typing here (a link, the back button).
  // Then the field follows the URL; our own navigations must not overwrite
  // what the user keeps typing while they are in flight.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== requestedQuery && !isPending) {
      setRequestedQuery(urlQuery);
      setValue(urlQuery);
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function showResults(query: string) {
    setRequestedQuery(query);
    startTransition(() => {
      router.replace(query ? `/?q=${encodeURIComponent(query)}` : "/", {
        scroll: false,
      });
    });
    // New results start from the top of the list
    window.scrollTo({ top: 0 });
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => showResults(nextValue.trim()),
      SEARCH_DELAY_MS,
    );
  }

  function clear() {
    setValue("");
    clearTimeout(timerRef.current);
    showResults("");
    inputRef.current?.focus();
  }

  return (
    <InputGroup className="h-10 rounded-full bg-card shadow-contact">
      <InputGroupAddon className="pl-3.5">
        {isPending ? <LoaderCircle className="animate-spin" /> : <Search />}
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            clear();
          }
        }}
      />
      {value && (
        <InputGroupAddon align="inline-end" className="pr-2.5">
          <InputGroupButton
            size="icon-xs"
            className="rounded-full"
            aria-label="Очистить поиск"
            onClick={clear}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

// Shown in the prerendered page shell until the URL is known.
// Looks exactly like the real field, so nothing jumps when it is replaced.
export function ContactSearchFallback() {
  return (
    <InputGroup className="h-10 rounded-full bg-card shadow-contact">
      <InputGroupAddon className="pl-3.5">
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        readOnly
      />
    </InputGroup>
  );
}
