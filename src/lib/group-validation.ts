import { z } from "zod";

export const groupNameSchema = z.string().trim().min(1, "Укажите название группы");

export type GroupFormState = {
  name: string;
  error?: string;
};

export type GroupMembershipState = { error?: string };
