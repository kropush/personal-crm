"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { KeepInTouchFrequency } from "@/db/keep-in-touch";
import {
  addNote,
  ContactGroupsChangedError,
  createContact,
  deleteContact,
  markContacted,
  setKeepInTouchFrequency,
  undoMarkContacted,
  updateContact,
  type ContactGroupSelection,
} from "@/lib/contacts";
import { groupNameSchema } from "@/lib/group-validation";
import { logError } from "@/lib/loggable-error";
import { requireUser } from "@/lib/session";
import {
  contactSchema,
  keepInTouchFrequencySchema,
  noteSchema,
  parseRecordId,
  recordIdSchema,
  SAVE_FAILED_MESSAGE,
  undoMarkContactedSchema,
  type ContactFormState,
  type ContactFormValues,
  type DeleteFormState,
  type MarkContactedResult,
  type NoteFormState,
  type SetKeepInTouchFrequencyResult,
  type UndoMarkContactedResult,
} from "@/lib/validation";

const DELETE_FAILED_MESSAGE =
  "Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const CONTACT_NOT_FOUND_MESSAGE = "Контакт не найден";
const GROUPS_CHANGED_MESSAGE =
  "Список групп изменился. Проверьте выбор и сохраните контакт ещё раз.";
const UNKNOWN_FREQUENCY_MESSAGE = "Не удалось сохранить: такой частоты нет";
const UNDO_NOT_POSSIBLE_MESSAGE = "Отменить не получилось: отметку уже изменили в другом окне";

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readTextList(formData: FormData, name: string) {
  return formData.getAll(name).map((value) => (typeof value === "string" ? value : ""));
}

function readContactValues(formData: FormData): ContactFormValues {
  return {
    name: readText(formData, "name"),
    about: readText(formData, "about"),
    howWeMet: readText(formData, "howWeMet"),
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    groupIds: readTextList(formData, "groupIds"),
    newGroupName: readText(formData, "newGroupName"),
    newGroupNames: readTextList(formData, "newGroupNames"),
  };
}

function validateContactValues(
  values: ContactFormValues,
): ContactFormState | { details: z.infer<typeof contactSchema>; selection: ContactGroupSelection } {
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: toFieldErrors(parsed.error) };
  }

  const groupIds = Array.from(new Set(values.groupIds.map(parseRecordId)));
  if (groupIds.some((id) => id === null)) {
    return { values, fieldErrors: { groupIds: GROUPS_CHANGED_MESSAGE } };
  }
  const names = groupNameSchema
    .array()
    .safeParse(
      values.newGroupName ? [...values.newGroupNames, values.newGroupName] : values.newGroupNames,
    );
  if (!names.success) {
    return { values, fieldErrors: { newGroupName: names.error.issues[0].message } };
  }

  return {
    details: parsed.data,
    selection: {
      groupIds: groupIds.filter((id) => id !== null),
      newGroupNames: names.data,
    },
  };
}

function revalidateNewGroupOptions() {
  revalidatePath("/groups");
  revalidatePath("/contacts/new");
  revalidatePath("/contacts/[id]/edit", "page");
}

function handleContactSaveError(
  error: unknown,
  message: string,
  values: ContactFormValues,
): ContactFormState {
  if (error instanceof ContactGroupsChangedError) {
    refresh();
    return { values, fieldErrors: { groupIds: GROUPS_CHANGED_MESSAGE } };
  }

  logError(message, error);
  return { values, fieldErrors: {}, formError: SAVE_FAILED_MESSAGE };
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
  const { id: ownerId } = await requireUser();
  // Sent back on failure, so the form keeps what the user has typed
  const values = readContactValues(formData);

  const parsed = validateContactValues(values);
  if ("fieldErrors" in parsed) return parsed;

  let contactId: number;
  try {
    contactId = await createContact(ownerId, parsed.details, parsed.selection);
  } catch (error) {
    return handleContactSaveError(error, "Failed to create contact", values);
  }

  revalidatePath("/");
  if (parsed.selection.groupIds.length || parsed.selection.newGroupNames.length) {
    revalidatePath("/groups/[id]", "page");
  }
  if (parsed.selection.newGroupNames.length) revalidateNewGroupOptions();
  // The list scrolls to the new contact and highlights it
  redirect(`/?added=${contactId}`);
}

export async function updateContactAction(
  contactId: number,
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const { id: ownerId } = await requireUser();
  // Sent back on failure, so the form keeps what the user has typed
  const values = readContactValues(formData);

  const parsedId = recordIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { values, fieldErrors: {}, formError: CONTACT_NOT_FOUND_MESSAGE };
  }
  const parsed = validateContactValues(values);
  if ("fieldErrors" in parsed) return parsed;

  let isUpdated: boolean;
  try {
    isUpdated = await updateContact(ownerId, parsedId.data, parsed.details, parsed.selection);
  } catch (error) {
    return handleContactSaveError(error, "Failed to update contact", values);
  }
  if (!isUpdated) {
    return { values, fieldErrors: {}, formError: CONTACT_NOT_FOUND_MESSAGE };
  }

  // The list shows the name, "who" line, phone and email too
  revalidatePath("/");
  revalidatePath(`/contacts/${parsedId.data}`);
  revalidatePath(`/contacts/${parsedId.data}/edit`);
  revalidatePath("/groups/[id]", "page");
  if (parsed.selection.newGroupNames.length) revalidateNewGroupOptions();
  redirect(`/contacts/${parsedId.data}`);
}

export async function deleteContactAction(contactId: number): Promise<DeleteFormState> {
  const { id: ownerId } = await requireUser();
  const parsedId = recordIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  try {
    if (!(await deleteContact(ownerId, parsedId.data))) {
      return { error: CONTACT_NOT_FOUND_MESSAGE };
    }
  } catch (error) {
    logError("Failed to delete contact", error);
    return { error: DELETE_FAILED_MESSAGE };
  }

  revalidatePath("/");
  // So that the browser's Back button does not bring back the deleted card
  revalidatePath(`/contacts/${parsedId.data}`);
  revalidatePath(`/contacts/${parsedId.data}/edit`);
  revalidatePath("/groups/[id]", "page");
  redirect("/");
}

export async function addNoteAction(
  contactId: number,
  previousState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const { id: ownerId } = await requireUser();
  const body = readText(formData, "body");
  const { savedCount } = previousState;

  const parsedId = recordIdSchema.safeParse(contactId);
  const parsedNote = noteSchema.safeParse({ body });
  if (!parsedId.success) {
    return { body, savedCount, error: CONTACT_NOT_FOUND_MESSAGE };
  }
  if (!parsedNote.success) {
    const { fieldErrors } = z.flattenError(parsedNote.error);
    return { body, savedCount, error: fieldErrors.body?.[0] };
  }

  try {
    if (!(await addNote(ownerId, parsedId.data, parsedNote.data.body))) {
      return { body, savedCount, error: CONTACT_NOT_FOUND_MESSAGE };
    }
  } catch (error) {
    logError("Failed to add note", error);
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
  const { id: ownerId } = await requireUser();
  const parsedId = recordIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }
  const parsedFrequency = keepInTouchFrequencySchema.safeParse(frequency);
  if (!parsedFrequency.success) {
    return { error: UNKNOWN_FREQUENCY_MESSAGE };
  }

  let isUpdated: boolean;
  try {
    isUpdated = await setKeepInTouchFrequency(ownerId, parsedId.data, parsedFrequency.data);
  } catch (error) {
    logError("Failed to set keep-in-touch frequency", error);
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
export async function markContactedAction(contactId: number): Promise<MarkContactedResult> {
  const { id: ownerId } = await requireUser();
  const parsedId = recordIdSchema.safeParse(contactId);
  if (!parsedId.success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  let marked: Awaited<ReturnType<typeof markContacted>>;
  try {
    marked = await markContacted(ownerId, parsedId.data);
  } catch (error) {
    logError("Failed to mark contact as contacted", error);
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
  const { id: ownerId } = await requireUser();
  const parsedId = recordIdSchema.safeParse(contactId);
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
      ownerId,
      parsedId.data,
      new Date(parsedMark.data.markedAt),
      parsedMark.data.previous === null ? null : new Date(parsedMark.data.previous),
    );
  } catch (error) {
    logError("Failed to undo the contacted mark", error);
    return { error: SAVE_FAILED_MESSAGE };
  }
  if (!isRestored) {
    return { error: UNDO_NOT_POSSIBLE_MESSAGE };
  }

  return {};
}
