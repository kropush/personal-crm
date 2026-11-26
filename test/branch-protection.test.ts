import { it } from "vitest";

it("fails intentionally to verify main branch protection", () => {
  throw new Error("Intentional CI failure for the branch protection check.");
});
