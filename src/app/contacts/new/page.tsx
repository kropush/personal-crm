import type { Metadata } from "next";

import { BackToContactsLink } from "@/components/back-to-contacts-link";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <main className="flex flex-col gap-6">
      <BackToContactsLink />
      <h1 className="text-2xl font-semibold tracking-tight">Новый контакт</h1>
      <ContactForm />
    </main>
  );
}
