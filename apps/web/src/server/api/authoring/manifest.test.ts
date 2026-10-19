import { describe, expect, it } from "vitest";

import { COMPONENT_NAMES } from "@/page-content/catalog";
import { get, nearestComponent } from "./manifest";

function componentNames(result: ReturnType<typeof get>): string[] {
  const components = result.body.components as Array<{ name: string }>;
  return components.map((component) => component.name);
}

describe("get manifest", () => {
  it("returns the complete closed catalog when components is omitted", () => {
    const result = get();

    expect(result.status).toBe(200);
    expect(componentNames(result)).toEqual(COMPONENT_NAMES);
  });

  it("trims, deduplicates, and filters a scoped component query", () => {
    const result = get({ components: " table,chart,table, metric " });

    expect(result.status).toBe(200);
    // Manifest order is stable; query order is not part of the response.
    expect(componentNames(result)).toEqual(["chart", "metric", "section", "table"]);
  });

  it("always includes the required section root in a scoped response", () => {
    expect(componentNames(get({ components: "progress" }))).toEqual(["progress", "section"]);
    expect(componentNames(get({ components: "section" }))).toEqual(["section"]);
  });

  it("rejects unknown and empty component names with the closed alternatives", () => {
    for (const components of ["chart,sparkline", "chart,,table", ""]) {
      const result = get({ components });

      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({
        code: "unknown_component",
        path: "/components",
        valid: COMPONENT_NAMES,
        next: ["get_manifest", "get_guide"],
      });
    }
  });

  /** Stale names get a `closest` suggestion so the retry is mechanical. */
  it("names the nearest catalog component so a stale name retries without thinking", () => {
    const result = get({ components: "section-text" });
    expect(result.status).toBe(422);
    expect(result.body.closest).toBe("section");
  });

  it("suggests nothing when nothing is near, rather than a confident wrong answer", () => {
    const result = get({ components: "totally-made-up-thing" });
    expect(result.status).toBe(422);
    expect(result.body.closest).toBeUndefined();
  });

  it("finds the catalog name behind a typo", () => {
    expect(nearestComponent("metrc")).toBe("metric");
    expect(nearestComponent("timelin")).toBe("timeline");
  });
});
