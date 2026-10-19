import { describe, expect, it } from "vitest";

import { schema } from "./schema";

const options = [
  { id: "guide", label: "Guide only" },
  { id: "both", label: "Guide and llms.txt" },
];

describe("decision schema", () => {
  it("lets an open call carry its wait in rationale", () => {
    expect(
      schema.safeParse({ question: "Ship where?", options, rationale: "Waiting on the docs owner." }).success,
    ).toBe(true);
  });

  it("refuses a settled decision with no reason", () => {
    const result = schema.safeParse({ question: "Ship where?", options, chosen_id: "both" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("settled decision needs its reason");
    }
  });

  it("accepts a settled decision with its reason", () => {
    expect(
      schema.safeParse({
        question: "Ship where?",
        options,
        chosen_id: "both",
        rationale: "llms.txt is what a new agent reads first.",
      }).success,
    ).toBe(true);
  });
});
