import { describe, expect, it } from "vitest";

import { GOLDEN_COMPOSITION_CANDIDATES } from "./cases";
import { parseCompositionCandidateArtifacts } from "./artifacts";

describe("composition evaluation artifacts", () => {
  it("rejects missing and unknown brief ids before scoring", () => {
    expect(() => parseCompositionCandidateArtifacts({
      "no-page-transient-status": null,
    })).toThrow("missing:");

    expect(() => parseCompositionCandidateArtifacts({
      ...GOLDEN_COMPOSITION_CANDIDATES,
      extra: null,
    })).toThrow("unexpected: extra");
  });
});
