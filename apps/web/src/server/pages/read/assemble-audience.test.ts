import { describe, expect, it } from "vitest";

import { pinnedForAudience } from "@/shared/navigation/audience";

describe("document metadata audience", () => {
  it("keeps pin state owner-only before a payload is serialized", () => {
    expect(pinnedForAudience(true, "owner")).toBe(true);
    expect(pinnedForAudience(true, "reader")).toBe(false);
    expect(pinnedForAudience(false, "reader")).toBe(false);
  });
});
