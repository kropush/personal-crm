"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { createContactAction, updateContactAction } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_LIMITS, type ContactFormValues } from "@/lib/validation";

const EMPTY_VALUES: ContactFormValues = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
};

type ContactFormProps = {
  // Given when editing an existing contact; without it the form adds a new one
  contact?: { id: number; values: ContactFormValues };
};

export function ContactForm(props: ContactFormProps) {
  // Next.js keeps a page mounted after the user leaves it, with whatever was
  // typed. A new key on every fresh visit starts the form from the saved data
  // instead of an abandoned draft, while the browser's Back button still
  // brings the draft back.
  const { bfcacheId } = useRouter();
  return <ContactFormFields key={bfcacheId} {...props} />;
}

function ContactFormFields({ contact }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(
    contact
      ? updateContactAction.bind(null, contact.id)
      : createContactAction,
    { values: contact?.values ?? EMPTY_VALUES, fieldErrors: {} },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const { values, fieldErrors, formError } = state;

  // After a failed save, put the cursor into the first field that needs fixing
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>("[aria-invalid='true']")
      ?.focus();
  }, [state]);

  return (
    // Fields are checked on the server, so every message is in Russian
    // and looks the same in any browser
    <form ref={formRef} action={formAction} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.name)}>
          <FieldLabel htmlFor="name">Имя</FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            maxLength={CONTACT_LIMITS.name}
            placeholder="Анна Смирнова"
            autoComplete="off"
            autoFocus
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
          />
          <FieldError id="name-error">{fieldErrors.name}</FieldError>
        </Field>

        <Field data-invalid={Boolean(fieldErrors.about)}>
          <FieldLabel htmlFor="about">Кто это</FieldLabel>
          <Input
            id="about"
            name="about"
            defaultValue={values.about}
            maxLength={CONTACT_LIMITS.about}
            placeholder="Стоматолог, одноклассник, коллега Миши"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.about)}
            aria-describedby={fieldErrors.about ? "about-error" : undefined}
          />
          <FieldError id="about-error">{fieldErrors.about}</FieldError>
        </Field>

        <Field data-invalid={Boolean(fieldErrors.howWeMet)}>
          <FieldLabel htmlFor="howWeMet">Откуда знакомы</FieldLabel>
          <Textarea
            id="howWeMet"
            name="howWeMet"
            defaultValue={values.howWeMet}
            maxLength={CONTACT_LIMITS.howWeMet}
            placeholder="Познакомились на свадьбе у Оли в 2023 году"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.howWeMet)}
            aria-describedby={
              fieldErrors.howWeMet ? "howWeMet-error" : undefined
            }
          />
          <FieldError id="howWeMet-error">{fieldErrors.howWeMet}</FieldError>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(fieldErrors.phone)}>
            <FieldLabel htmlFor="phone">Телефон</FieldLabel>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              maxLength={CONTACT_LIMITS.phone}
              placeholder="+7 900 000-00-00"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
            />
            <FieldError id="phone-error">{fieldErrors.phone}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.email)}>
            <FieldLabel htmlFor="email">Почта</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
              maxLength={CONTACT_LIMITS.email}
              placeholder="anna@example.com"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            <FieldError id="email-error">{fieldErrors.email}</FieldError>
          </Field>
        </div>

        <FieldDescription>
          {contact
            ? "Обязательно только имя."
            : "Обязательно только имя. Заметки о разговорах можно будет добавлять в карточке контакта."}
        </FieldDescription>

        {formError && <FieldError>{formError}</FieldError>}

        <div className="flex items-center gap-2">
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending && <LoaderCircle className="animate-spin" />}
            {contact ? "Сохранить изменения" : "Сохранить контакт"}
          </Button>
          <Link
            href={contact ? `/contacts/${contact.id}` : "/"}
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            Отмена
          </Link>
        </div>
      </FieldGroup>
    </form>
  );
}
