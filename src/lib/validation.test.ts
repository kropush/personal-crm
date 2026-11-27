import { describe, expect, it } from "vitest";

import { contactSchema } from "./validation";

describe("contact form validation", () => {
  const emptyDetails = { about: "", howWeMet: "", phone: "", email: "" };

  it("rejects a blank contact name", () => {
    expect(contactSchema.safeParse({ ...emptyDetails, name: "  " }).success).toBe(false);
  });

  it("trims the contact name and keeps optional details empty", () => {
    expect(contactSchema.parse({ ...emptyDetails, name: " Anna " })).toEqual({
      name: "Anna",
      about: null,
      howWeMet: null,
      phone: null,
      email: null,
    });
  });
});
