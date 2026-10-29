import { z } from "zod";

import { KEEP_IN_TOUCH_FREQUENCIES } from "@/db/keep-in-touch";

export const CONTACT_LIMITS = {
  name: 120,
  about: 200,
  howWeMet: 500,
  phone: 40,
  email: 254,
} as const;

export const NOTE_MAX_LENGTH = 5000;

// Also shown by the browser when a request does not reach the server at all
export const SAVE_FAILED_MESSAGE =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

// Postgres integer primary keys stop here
const MAX_ID = 2_147_483_647;

// Deliberately loose: only catches obvious typos and accepts non-ASCII domains
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tooLong(max: number) {
  return `Слишком длинно: не больше ${max} символов`;
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, tooLong(max))
    .transform((value) => value || null);
}

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(CONTACT_LIMITS.name, tooLong(CONTACT_LIMITS.name)),
  about: optionalText(CONTACT_LIMITS.about),
  howWeMet: optionalText(CONTACT_LIMITS.howWeMet),
  phone: optionalText(CONTACT_LIMITS.phone),
  email: z
    .string()
    .trim()
    .max(CONTACT_LIMITS.email, tooLong(CONTACT_LIMITS.email))
    .refine(
      (value) => value === "" || EMAIL_PATTERN.test(value),
      "Проверьте адрес почты: похоже, в нём ошибка",
    )
    .transform((value) => value || null),
});

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст заметки")
    .max(NOTE_MAX_LENGTH, tooLong(NOTE_MAX_LENGTH)),
});

export const contactIdSchema = z.number().int().positive().max(MAX_ID);

// null is "Не задано"
export const keepInTouchFrequencySchema = z
  .enum(KEEP_IN_TOUCH_FREQUENCIES)
  .nullable();

// What markContactedAction returned, sent back to undo the mark
export const undoMarkContactedSchema = z.object({
  markedAt: z.iso.datetime(),
  previous: z.iso.datetime().nullable(),
});

// Parses the [id] URL segment; returns null for anything that is not a valid id
export function parseContactId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return id <= MAX_ID ? id : null;
}

export type ContactFormValues = Record<keyof typeof CONTACT_LIMITS, string>;

export type ContactFormState = {
  values: ContactFormValues;
  fieldErrors: Partial<Record<keyof ContactFormValues, string>>;
  formError?: string;
};

export type NoteFormState = {
  body: string;
  error?: string;
  // Grows by one on every saved note, so the form can confirm each save
  savedCount: number;
};

export type DeleteContactState = {
  error?: string;
};

export type SetKeepInTouchFrequencyResult = {
  error?: string;
};

// The moments are ISO strings: they go to the browser and back
export type MarkContactedResult =
  | { error?: undefined; markedAt: string; previous: string | null }
  | { error: string };

export type UndoMarkContactedResult = {
  error?: string;
};
