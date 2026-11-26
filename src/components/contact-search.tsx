"use client";

import { LoaderCircle, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { ContactGroupFilter } from "@/components/contact-group-filter";
import { buttonVariants } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { Group } from "@/db/schema";
import { contactListHref } from "@/lib/search-params";

const SEARCH_DELAY_MS = 200;

function ContactSearchBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-background/95 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
      {children}
      <Link
        href="/contacts/new"
        className={buttonVariants({ size: "lg", className: "max-sm:px-4" })}
      >
        <Plus />
        <span className="sm:hidden">Добавить</span>
        <span className="hidden sm:inline">Добавить контакт</span>
      </Link>
    </div>
  );
}

export function ContactSearch({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const urlGroup = params.get("group") ?? "";
  const currentHref = contactListHref(urlQuery, urlGroup);

  const [value, setValue] = useState(urlQuery);
  const [groupId, setGroupId] = useState(urlGroup);
  const [requestedHref, setRequestedHref] = useState(currentHref);
  const [seenHref, setSeenHref] = useState(currentHref);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedGroup = groups.some((group) => String(group.id) === groupId)
    ? groupId
    : "";

  // Follow external navigation while keeping newer input during our own requests.
  if (currentHref !== seenHref) {
    setSeenHref(currentHref);
    if (currentHref !== requestedHref && !isPending) {
      setValue(urlQuery);
      setGroupId(urlGroup);
    }
  }

  useEffect(() => {
    if (currentHref !== requestedHref && !isPending) {
      clearTimeout(timerRef.current);
    }
  }, [currentHref, requestedHref, isPending]);

  useEffect(() => {
    function restoreHistory() {
      clearTimeout(timerRef.current);
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q") ?? "";
      const group = params.get("group") ?? "";
      setValue(query);
      setGroupId(group);
      setRequestedHref(contactListHref(query, group));
    }
    window.addEventListener("popstate", restoreHistory);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("popstate", restoreHistory);
    };
  }, []);

  function showResults(
    query: string,
    group: string,
    navigation: "replace" | "push",
  ) {
    const href = contactListHref(query, group);
    setRequestedHref(href);
    startTransition(() => {
      router[navigation](href, { scroll: false });
    });
    // New results start from the top of the list
    window.scrollTo({ top: 0 });
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => showResults(nextValue.trim(), selectedGroup, "replace"),
      SEARCH_DELAY_MS,
    );
  }

  function clear() {
    setValue("");
    clearTimeout(timerRef.current);
    showResults("", selectedGroup, "replace");
    inputRef.current?.focus();
  }

  function changeGroup(nextGroup: string) {
    // Apply the current input with the new group, including a queued search.
    clearTimeout(timerRef.current);
    setGroupId(nextGroup);
    showResults(value.trim(), nextGroup, "push");
  }

  return (
    <>
      <ContactSearchBar>
        <InputGroup className="h-10 min-w-0 flex-1 rounded-full bg-card shadow-contact">
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
      </ContactSearchBar>
      <ContactGroupFilter
        groups={groups}
        value={selectedGroup}
        onChange={changeGroup}
      />
    </>
  );
}

// Shown in the prerendered page shell until the URL is known.
// Looks exactly like the real field, so nothing jumps when it is replaced.
export function ContactSearchFallback() {
  return (
    <>
      <ContactSearchBar>
        <InputGroup className="h-10 min-w-0 flex-1 rounded-full bg-card shadow-contact">
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
      </ContactSearchBar>
      <ContactGroupFilter groups={[]} disabled />
    </>
  );
}
