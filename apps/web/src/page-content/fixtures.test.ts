/**
 * Registry gates: every fixture element and every `meta.example` validates, and every generated
 * JSON Schema stays within the strict-mode subset (closed, flat, no `oneOf` or `maxItems`).
 */
import { describe, expect, it } from "vitest";

import { move, releaseReview, triathlon, trip } from "@/page-content/document/fixtures";
import { COMPONENT_NAMES, registry, validateProps } from "./catalog";
import { StrataSpecSchema } from "./schema";
import { propsJsonSchema } from "@/page-content/authoring/manifest";
import { SINCE } from "./catalog-versions";

const LOCKED_COMPONENTS = [
  "accordion",
  "approval",
  "attachment-list",
  "breakdown",
  "callout",
  "card",
  "carousel",
  "chart",
  "checklist",
  "code-block",
  "comparison",
  "decision",
  "facts",
  "grid",
  "item-list",
  "link-button",
  "metric",
  "phases",
  "progress",
  "prose",
  "quote",
  "reference-list",
  "section",
  "status-list",
  "streak-grid",
  "table",
  "timeline",
];

const fixtures = { move, releaseReview, triathlon, trip };

describe("the catalog", () => {
  it("is exactly the locked semantic catalog, in name order", () => {
    expect([...COMPONENT_NAMES]).toEqual(LOCKED_COMPONENTS);
  });

  it("keys the map by each type's own meta.name", () => {
    for (const name of COMPONENT_NAMES) {
      expect(registry[name].meta.name).toBe(name);
      expect(registry[name].meta.since).toBe(SINCE[name]);
    }
  });
});

describe("fixtures validate against the registry", () => {
  it("collectively exercise every shipped component", () => {
    const used = new Set(
      Object.values(fixtures).flatMap((doc) =>
        Object.values(doc.spec.elements).map((element) => element.type),
      ),
    );
    expect([...used].sort()).toEqual([...COMPONENT_NAMES]);
  });

  for (const [fixtureName, doc] of Object.entries(fixtures)) {
    for (const [elementId, element] of Object.entries(doc.spec.elements)) {
      it(`${fixtureName}: ${elementId} (${element.type})`, () => {
        const result = validateProps(element.type, element.props);
        expect(result.issues, `${elementId} → ${JSON.stringify(result.issues)}`).toEqual([]);
        expect(result.ok).toBe(true);
      });
    }
  }
});

describe("meta.example", () => {
  for (const name of COMPONENT_NAMES) {
    it(`${name}: the example validates against its own schema`, () => {
      const result = validateProps(name, registry[name].meta.example);
      expect(result.issues, `${name} → ${JSON.stringify(result.issues)}`).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe("validateProps", () => {
  it("never sees an unknown component: the spec edge names the whole catalog first (§3.3)", () => {
    // The spec schema's type enum refuses unknown components with the full list.
    const result = StrataSpecSchema.safeParse({
      answer: { verdict: "Everything is where it should be." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["board"] },
        board: { type: "kanban", props: {}, children: [] },
      },
    });
    expect(result.success).toBe(false);
    const message = result.success ? "" : result.error.issues.map((issue) => issue.message).join(" ");
    for (const name of COMPONENT_NAMES) {
      expect(message).toContain(name);
    }
  });

  it("rejects an unknown prop and names it (closed objects)", () => {
    const result = validateProps("metric", {
      label: "Hours",
      value: 3,
      colour: "red",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("colour"))).toBe(true);
  });

  it("rejects layout and decorative props the blocks do not take", () => {
    expect(validateProps("metric", { label: "Hours", value: 3, icon: "star" }).ok)
      .toBe(false);
    expect(validateProps("section", { title: "Overview", columns: 2 }).ok).toBe(false);
  });

  it("points at the offending item inside a collection", () => {
    const result = validateProps("checklist", {
      items: [
        { id: "a", label: "ok", done: true },
        { id: "b", label: "bad", done: "yes" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toEqual(["items", 1, "done"]);
  });

  it("enforces exactly one of url / page_id on link-button", () => {
    expect(validateProps("link-button", { label: "a", url: "https://example.com/x" }).ok).toBe(true);
    expect(validateProps("link-button", { label: "a" }).ok).toBe(false);
    expect(
      validateProps("link-button", {
        label: "a",
        url: "https://example.com/x",
        page_id: "3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455",
      }).ok,
    ).toBe(false);
    expect(validateProps("link-button", { label: "a", url: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("keeps code exact and bounded without visual or executable props", () => {
    expect(validateProps("code-block", { code: "const value = 1;", language: "ts" }).ok)
      .toBe(true);
    expect(validateProps("code-block", { code: "x", kind: "terminal" }).ok).toBe(false);
    expect(validateProps("code-block", { code: "x", execute: true }).ok).toBe(false);
  });

  it("accepts only bounded http(s) reference lists", () => {
    const source = {
      id: "catalog",
      title: "Catalogs",
      url: "https://json-render.dev/docs/catalog",
    };
    expect(validateProps("reference-list", { items: [source] }).ok).toBe(true);
    expect(validateProps("reference-list", { items: [{ ...source, url: "javascript:alert(1)" }] }).ok)
      .toBe(false);
    // Duplicate item ids are checked by the spec-wide rule, not here.
  });

  it("takes a published_at at whatever precision the source states", () => {
    const source = {
      id: "catalog",
      title: "Catalogs",
      url: "https://json-render.dev/docs/catalog",
    };
    for (const published_at of ["2019", "2019-06", "2019-06-04", "2019-06-04T09:00:00Z"]) {
      expect(validateProps("reference-list", { items: [{ ...source, published_at }] }).ok).toBe(true);
    }
    expect(validateProps("reference-list", { items: [{ ...source, published_at: "2019-13" }] }).ok)
      .toBe(false);
  });
});

/* ------------------------------------------------ the JSON Schema walk */

/** Keywords the strict-mode subset does not support. */
const FORBIDDEN_KEYWORDS = [
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "$ref",
  "$defs",
  "definitions",
  "patternProperties",
  "propertyNames",
  "dependentRequired",
  "unevaluatedProperties",
  // Anthropic also rejects minItems > 1, checked separately below.
  "maxItems",
];

interface Visit {
  element: Record<string, unknown>;
  path: string;
  /** How many object schemas deep this element sits (the props object is 1). */
  objectDepth: number;
  /** True if an enclosing schema is already an `anyOf` branch. */
  insideUnion: boolean;
}

/** Every subschema, depth-first. */
function walk(root: Record<string, unknown>): Visit[] {
  const out: Visit[] = [];
  const queue: Visit[] = [{ element: root, path: "$", objectDepth: 0, insideUnion: false }];

  while (queue.length > 0) {
    const visit = queue.pop()!;
    out.push(visit);
    const { element, path, insideUnion } = visit;
    const isObjectSchema = element["type"] === "object";
    const objectDepth = visit.objectDepth + (isObjectSchema ? 1 : 0);

    const properties = element["properties"];
    if (properties !== undefined && typeof properties === "object") {
      for (const [key, child] of Object.entries(properties as Record<string, unknown>)) {
        queue.push({
          element: child as Record<string, unknown>,
          path: `${path}.${key}`,
          objectDepth,
          insideUnion,
        });
      }
    }

    const items = element["items"];
    if (items !== undefined && typeof items === "object") {
      queue.push({
        element: items as Record<string, unknown>,
        path: `${path}[]`,
        objectDepth,
        insideUnion,
      });
    }

    const anyOf = element["anyOf"];
    if (Array.isArray(anyOf)) {
      anyOf.forEach((branch, index) => {
        queue.push({
          element: branch as Record<string, unknown>,
          path: `${path}|${index}`,
          objectDepth,
          insideUnion: true,
        });
      });
    }
  }

  return out;
}

describe("generated JSON Schema survives the strict-mode subset", () => {
  for (const name of COMPONENT_NAMES) {
    describe(name, () => {
      // Conversion throws on cycles and unrepresentable props.
      const json = propsJsonSchema(name);
      const visits = walk(json);

      it("converts without throwing, and is a closed object at the root", () => {
        expect(json["type"]).toBe("object");
        expect(json["additionalProperties"]).toBe(false);
        expect(json["$schema"]).toBeUndefined();
      });

      it("uses no forbidden keyword anywhere", () => {
        for (const { element, path } of visits) {
          for (const keyword of FORBIDDEN_KEYWORDS) {
            expect(
              Object.prototype.hasOwnProperty.call(element, keyword),
              `${name} ${path} carries ${keyword}`,
            ).toBe(false);
          }
          if (typeof element["minItems"] === "number") {
            expect(
              element["minItems"],
              `${name} ${path} carries unsupported minItems`,
            ).toBeLessThanOrEqual(1);
          }
        }
      });

      it("closes every object (additionalProperties: false)", () => {
        for (const { element, path } of visits) {
          if (element["type"] !== "object") continue;
          expect(element["additionalProperties"], `${name} ${path} is an open object`).toBe(false);
        }
      });

      it("keeps unions flat and non-recursive", () => {
        for (const { element, path, insideUnion } of visits) {
          if (!Array.isArray(element["anyOf"])) continue;
          // Nested unions inflate constrained-decoding grammars.
          expect(insideUnion, `${name} ${path} nests a union inside a union`).toBe(false);
        }
      });

      it("stays within flat props, depth ≤ 3 (§3.1)", () => {
        for (const { element, path, objectDepth } of visits) {
          if (element["type"] !== "object") continue;
          expect(objectDepth + 1, `${name} ${path} is ${objectDepth + 1} objects deep`).toBeLessThanOrEqual(3);
        }
      });
    });
  }
});
