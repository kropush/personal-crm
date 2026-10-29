// How often I want to talk to a person. No value means "not set".
//
// Kept apart from schema.ts: browser code reaches this list through
// validation.ts, and schema.ts would bring the whole of Drizzle with it.
export const KEEP_IN_TOUCH_FREQUENCIES = [
  "week",
  "month",
  "quarter",
  "year",
] as const;

export type KeepInTouchFrequency = (typeof KEEP_IN_TOUCH_FREQUENCIES)[number];
