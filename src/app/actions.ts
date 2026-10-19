"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addNote,
  createContact,
  getContact,
  updateContact,
} from "@/lib/contacts";
import {
  contactIdSchema,
  contactSchema,
  noteSchema,
  type ContactFormState,
  type ContactFormValues,
  type NoteFormState,
} from "@/lib/validation";

const SAVE_FAILED_MESSAGE =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const CONTACT_NOT_FOUND_MESSAGE = "Контакт не найден";

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readContactValues(formData: FormData): ContactFormValues {
  return {
    name: readText(formData, "name"),
    about: readText(formData, "about"),
    howWeMet: readText(formData, "howWeMet"),
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
  };
}

function toFieldErrors(
  error: z.ZodError<z.infer<typeof contactSchema>>,
): ContactFormState["fieldErrors"] {
  const { fieldErrors } = z.flattenError(error);
  return {
    name: fieldErrors.name?.[0],
    about: fieldErrors.about?.[0],
    howWeMet: fieldErrors.howWeMet?.[0],
    phone: fieldErrors.phone?.[0],
    email: fieldErrors.email?.[0],
  };
}

export async function createContactAction(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  // Sent back on failure, so the form keeps what the user has typed
  const values = readContactValues(formData);

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: toFieldErrors(parsed.error) };
  }

  let contactId: number;
  try {
    contactId = await createContact(parsed.data);
  } catch (error) {
    console.error("Failed to create contact", error);
    return { values, fieldErrors: {}, formError: SAVE_FAILED_MESSAGE };
  }

  revalidatePath("/");
  // The list scrolls to the new contact and highlights it
  redirect(`/?added=${contactId}`);
}

export async function updateContactAction(
  contactId: number,
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  // Sent back on failure, so the form keeps what the user has typed
  const values = readContactValues(formData);

  const parsedId = contactIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { values, fieldErrors: {}, formError: CONTACT_NOT_FOUND_MESSAGE };
  }
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: toFieldErrors(parsed.error) };
  }

  let isUpdated: boolean;
  try {
    isUpdated = await updateContact(parsedId.data, parsed.data);
  } catch (error) {
    console.error("Failed to update contact", error);
    return { values, fieldErrors: {}, formError: SAVE_FAILED_MESSAGE };
  }
  if (!isUpdated) {
    return { values, fieldErrors: {}, formError: CONTACT_NOT_FOUND_MESSAGE };
  }

  // The list shows the name, "who" line, phone and email too
  revalidatePath("/");
  revalidatePath(`/contacts/${parsedId.data}`);
  redirect(`/contacts/${parsedId.data}`);
}

export async function addNoteAction(
  contactId: number,
  previousState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const body = readText(formData, "body");
  const { savedCount } = previousState;

  const parsedId = contactIdSchema.safeParse(contactId);
  const parsedNote = noteSchema.safeParse({ body });
  if (!parsedId.success) {
    return { body, savedCount, error: CONTACT_NOT_FOUND_MESSAGE };
  }
  if (!parsedNote.success) {
    const { fieldErrors } = z.flattenError(parsedNote.error);
    return { body, savedCount, error: fieldErrors.body?.[0] };
  }

  try {
    const contact = await getContact(parsedId.data);
    if (!contact) {
      return { body, savedCount, error: CONTACT_NOT_FOUND_MESSAGE };
    }
    await addNote(parsedId.data, parsedNote.data.body);
  } catch (error) {
    console.error("Failed to add note", error);
    return { body, savedCount, error: SAVE_FAILED_MESSAGE };
  }

  refresh();
  return { body: "", savedCount: savedCount + 1 };
}
