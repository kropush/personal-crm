"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { KeepInTouchFrequency } from "@/db/keep-in-touch";
import {
  addNote,
  createContact,
  deleteContact,
  getContact,
  markContacted,
  setKeepInTouchFrequency,
  undoMarkContacted,
  updateContact,
} from "@/lib/contacts";
import {
  contactIdSchema,
  contactSchema,
  keepInTouchFrequencySchema,
  noteSchema,
  SAVE_FAILED_MESSAGE,
  undoMarkContactedSchema,
  type ContactFormState,
  type ContactFormValues,
  type DeleteContactState,
  type MarkContactedResult,
  type NoteFormState,
  type SetKeepInTouchFrequencyResult,
  type UndoMarkContactedResult,
} from "@/lib/validation";

const DELETE_FAILED_MESSAGE =
  "Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const CONTACT_NOT_FOUND_MESSAGE = "Контакт не найден";
const UNKNOWN_FREQUENCY_MESSAGE = "Не удалось сохранить: такой частоты нет";
const UNDO_NOT_POSSIBLE_MESSAGE =
  "Отменить не получилось: отметку уже изменили в другом окне";

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

export async function deleteContactAction(
  contactId: number,
): Promise<DeleteContactState> {
  const parsedId = contactIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  // A contact already deleted in another browser is not an error:
  // either way it is gone, and the list is the place to go
  try {
    await deleteContact(parsedId.data);
  } catch (error) {
    console.error("Failed to delete contact", error);
    return { error: DELETE_FAILED_MESSAGE };
  }

  revalidatePath("/");
  // So that the browser's Back button does not bring back the deleted card
  revalidatePath(`/contacts/${parsedId.data}`);
  redirect("/");
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

  // A note restarts the countdown: the contact may leave the home page block
  revalidatePath("/");
  refresh();
  return { body: "", savedCount: savedCount + 1 };
}

export async function setKeepInTouchFrequencyAction(
  contactId: number,
  frequency: KeepInTouchFrequency | null,
): Promise<SetKeepInTouchFrequencyResult> {
  const parsedId = contactIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }
  const parsedFrequency = keepInTouchFrequencySchema.safeParse(frequency);
  if (!parsedFrequency.success) {
    return { error: UNKNOWN_FREQUENCY_MESSAGE };
  }

  let isUpdated: boolean;
  try {
    isUpdated = await setKeepInTouchFrequency(
      parsedId.data,
      parsedFrequency.data,
    );
  } catch (error) {
    console.error("Failed to set keep-in-touch frequency", error);
    return { error: SAVE_FAILED_MESSAGE };
  }
  if (!isUpdated) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  // The card shows the new due date, the home page block may change
  revalidatePath("/");
  revalidatePath(`/contacts/${parsedId.data}`);
  return {};
}

// Does not refresh the page: the caller decides when. The home page block
// keeps the row for a few seconds, so that the mark can be undone.
export async function markContactedAction(
  contactId: number,
): Promise<MarkContactedResult> {
  const parsedId = contactIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  let marked: Awaited<ReturnType<typeof markContacted>>;
  try {
    marked = await markContacted(parsedId.data);
  } catch (error) {
    console.error("Failed to mark contact as contacted", error);
    return { error: SAVE_FAILED_MESSAGE };
  }
  if (!marked) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  return {
    markedAt: marked.markedAt.toISOString(),
    previous: marked.previous?.toISOString() ?? null,
  };
}

// Does not refresh the page either, see markContactedAction
export async function undoMarkContactedAction(
  contactId: number,
  markedAt: string,
  previous: string | null,
): Promise<UndoMarkContactedResult> {
  const parsedId = contactIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }
  const parsedMark = undoMarkContactedSchema.safeParse({ markedAt, previous });
  if (!parsedMark.success) {
    return { error: UNDO_NOT_POSSIBLE_MESSAGE };
  }

  let isRestored: boolean;
  try {
    isRestored = await undoMarkContacted(
      parsedId.data,
      new Date(parsedMark.data.markedAt),
      parsedMark.data.previous === null
        ? null
        : new Date(parsedMark.data.previous),
    );
  } catch (error) {
    console.error("Failed to undo the contacted mark", error);
    return { error: SAVE_FAILED_MESSAGE };
  }
  if (!isRestored) {
    return { error: UNDO_NOT_POSSIBLE_MESSAGE };
  }

  return {};
}
