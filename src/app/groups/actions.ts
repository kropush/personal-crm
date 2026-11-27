"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import {
  groupNameSchema,
  type GroupFormState,
  type GroupMembershipState,
} from "@/lib/group-validation";
import { createGroup, deleteGroup, renameGroup, setGroupMember } from "@/lib/groups";
import { logError } from "@/lib/loggable-error";
import { requireUser } from "@/lib/session";
import { recordIdSchema, SAVE_FAILED_MESSAGE, type DeleteFormState } from "@/lib/validation";

const GROUP_NOT_FOUND_MESSAGE = "Группа не найдена";
const CONTACT_NOT_FOUND_MESSAGE = "Контакт не найден";

function revalidateGroupName(groupId?: number) {
  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath("/contacts/new");
  revalidatePath("/contacts/[id]/edit", "page");
  if (groupId !== undefined) {
    revalidatePath("/groups/[id]", "page");
    revalidatePath("/contacts/[id]", "page");
  }
}

function readGroupName(formData: FormData) {
  const input = formData.get("name");
  return typeof input === "string" ? input : "";
}

export async function createGroupAction(
  _previousState: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const { id: ownerId } = await requireUser();
  const name = readGroupName(formData);
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) return { name, error: parsed.error.issues[0].message };

  try {
    await createGroup(ownerId, parsed.data);
  } catch (error) {
    logError("Failed to create group", error);
    return { name, error: SAVE_FAILED_MESSAGE };
  }

  revalidateGroupName();
  return { name: "" };
}

export async function renameGroupAction(
  groupId: number,
  _previousState: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const { id: ownerId } = await requireUser();
  const name = readGroupName(formData);
  if (!recordIdSchema.safeParse(groupId).success) {
    return { name, error: GROUP_NOT_FOUND_MESSAGE };
  }
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) return { name, error: parsed.error.issues[0].message };

  try {
    if (!(await renameGroup(ownerId, groupId, parsed.data))) {
      return { name, error: GROUP_NOT_FOUND_MESSAGE };
    }
  } catch (error) {
    logError("Failed to rename group", error);
    return { name, error: SAVE_FAILED_MESSAGE };
  }

  revalidateGroupName(groupId);
  return { name: parsed.data };
}

export async function deleteGroupAction(
  groupId: number,
  _previousState: DeleteFormState,
  formData: FormData,
): Promise<DeleteFormState> {
  const { id: ownerId } = await requireUser();
  if (formData.get("confirmation") !== "delete") {
    return { error: "Подтвердите удаление группы" };
  }
  if (!recordIdSchema.safeParse(groupId).success) {
    return { error: GROUP_NOT_FOUND_MESSAGE };
  }

  try {
    if (!(await deleteGroup(ownerId, groupId))) {
      return { error: GROUP_NOT_FOUND_MESSAGE };
    }
  } catch (error) {
    logError("Failed to delete group", error);
    return { error: "Не удалось удалить группу. Попробуйте ещё раз." };
  }

  revalidateGroupName(groupId);
  redirect("/groups");
}

export async function addGroupMemberAction(
  groupId: number,
  contactId: number,
): Promise<GroupMembershipState> {
  const state = await updateGroupMember(groupId, contactId, true);
  if (state.error) return state;

  // Clearing the URL prevents a later removal from restoring the old results.
  redirect(`/groups/${groupId}`, RedirectType.replace);
}

export async function removeGroupMemberAction(
  groupId: number,
  contactId: number,
): Promise<GroupMembershipState> {
  return updateGroupMember(groupId, contactId, false);
}

async function updateGroupMember(
  groupId: number,
  contactId: number,
  isMember: boolean,
): Promise<GroupMembershipState> {
  const { id: ownerId } = await requireUser();
  if (!recordIdSchema.safeParse(groupId).success) {
    return { error: GROUP_NOT_FOUND_MESSAGE };
  }
  if (!recordIdSchema.safeParse(contactId).success) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  try {
    const result = await setGroupMember(ownerId, groupId, contactId, isMember);
    if (result === "group-not-found") return { error: GROUP_NOT_FOUND_MESSAGE };
    if (result === "contact-not-found") return { error: CONTACT_NOT_FOUND_MESSAGE };
  } catch (error) {
    logError("Failed to update group membership", error);
    return { error: SAVE_FAILED_MESSAGE };
  }

  revalidatePath("/groups/[id]", "page");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/contacts/${contactId}/edit`);
  revalidatePath("/");
  return {};
}
