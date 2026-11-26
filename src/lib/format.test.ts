import { describe, expect, it } from "vitest";

import { formatDateTime, formatDueDate, formatOverdue } from "./format";

describe("keep-in-touch dates", () => {
  it.each([
    ["2026-11-28", 2026, "28 ноября"],
    ["2027-01-28", 2026, "28 января 2027"],
  ])("formats %s when the current year is %i", (date, currentYear, label) => {
    expect(formatDueDate(date, currentYear)).toBe(label);
  });

  it.each([
    [0, "сегодня"],
    [1, "просрочено на 1 день"],
    [2, "просрочено на 2 дня"],
    [12, "просрочено на 12 дней"],
  ])("formats a delay of %i days", (days, label) => {
    expect(formatOverdue(days)).toBe(label);
  });

  it.each([
    ["2026-10-28T20:59:00Z", /^28 октября.*23:59$/],
    ["2026-10-28T21:30:00Z", /^29 октября.*00:30$/],
  ])("displays the note time in Moscow for %s", (instant, label) => {
    expect(formatDateTime(new Date(instant))).toMatch(label);
  });
});
