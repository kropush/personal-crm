import { refresh, revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markContactedAction, setKeepInTouchFrequencyAction } from "@/app/actions";
import { markContacted, setKeepInTouchFrequency } from "@/lib/contacts";
import { logError } from "@/lib/loggable-error";

vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/contacts", () => ({
  markContacted: vi.fn(),
  setKeepInTouchFrequency: vi.fn(),
}));
vi.mock("@/lib/loggable-error", () => ({ logError: vi.fn() }));

vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "reminder-owner" }) }));

describe("keep-in-touch save failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a save error without refreshing the card or home page when the frequency write fails", async () => {
    const failure = new Error("Database unavailable");
    vi.mocked(setKeepInTouchFrequency).mockRejectedValueOnce(failure);

    await expect(setKeepInTouchFrequencyAction(42, "month")).resolves.toEqual({
      error: expect.stringContaining("Не удалось сохранить"),
    });
    expect(setKeepInTouchFrequency).toHaveBeenCalledWith("reminder-owner", 42, "month");
    expect(logError).toHaveBeenCalledWith(expect.any(String), failure);
    expect(refresh).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a save error without a mark or a page refresh when the mark write fails", async () => {
    const failure = new Error("Database unavailable");
    vi.mocked(markContacted).mockRejectedValueOnce(failure);

    await expect(markContactedAction(42)).resolves.toEqual({
      error: expect.stringContaining("Не удалось сохранить"),
    });
    expect(markContacted).toHaveBeenCalledWith("reminder-owner", 42);
    expect(logError).toHaveBeenCalledWith(expect.any(String), failure);
    expect(refresh).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
