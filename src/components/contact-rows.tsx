"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
import type { ContactListItem } from "@/lib/contacts";
import { cn } from "@/lib/utils";

// A Client Component on purpose: the server sends the list as compact data
// instead of a rendered tree for every row, which keeps a page with a
// thousand contacts light and quick to produce.
export function ContactRows({
  contacts,
  addedId,
}: {
  contacts: ContactListItem[];
  // The contact that has just been created, if the list was opened right after
  addedId: number | null;
}) {
  useEffect(() => {
    if (addedId === null) return;
    document
      .getElementById(`contact-${addedId}`)
      ?.scrollIntoView({ block: "center" });
    // Drop ?added= so that reloading the page does not highlight it again
    window.history.replaceState(null, "", window.location.pathname);
  }, [addedId]);

  return (
    <ul className="divide-y divide-line-2 overflow-hidden rounded-card bg-card shadow-contact">
      {contacts.map((contact) => {
        const isJustAdded = contact.id === addedId;
        return (
          <li key={contact.id} id={`contact-${contact.id}`}>
            <Link
              href={`/contacts/${contact.id}`}
              className={cn(
                "flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted sm:px-5",
                isJustAdded && "bg-violet/6 hover:bg-violet/10",
              )}
            >
              <ContactAvatar name={contact.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{contact.name}</span>
                  {isJustAdded && (
                    <span className="shrink-0 rounded-full bg-linear-to-r/srgb from-indigo to-violet px-2 py-0.5 text-xs font-medium text-white">
                      Новый
                    </span>
                  )}
                </div>
                {contact.about && (
                  <div className="truncate text-sm text-muted-foreground">
                    {contact.about}
                  </div>
                )}
              </div>
              {(contact.phone || contact.email) && (
                <div className="hidden max-w-[40%] shrink-0 text-right text-sm text-muted-foreground sm:block">
                  {contact.phone && (
                    <div className="truncate">{contact.phone}</div>
                  )}
                  {contact.email && (
                    <div className="truncate">{contact.email}</div>
                  )}
                </div>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
