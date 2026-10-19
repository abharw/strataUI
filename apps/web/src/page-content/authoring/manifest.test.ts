/**
 * Snapshot gate: fails when anything the model reads changes without regenerating the committed
 * files. After an intentional change, run `pnpm gen:manifest`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { defineCatalog } from "@json-render/core";

// package.json sits above `src`, outside the `@/` alias.
// oxlint-disable-next-line no-restricted-imports -- see above.
import packageJson from "../../../package.json";
import { COMPONENT_NAMES, registry } from "@/page-content/catalog";
import { CARD_CHILD_TYPES, GRID_CHILD_TYPES } from "@/page-content/document/composition";
import { strataCatalog } from "@/page-content/json-render/catalog";
import { buildManifest, generateManifest, serializeManifest } from "./manifest";
import {
  CARD_GRID_EXAMPLE,
  displayPromptExtended,
  ITEM_LIST_LINKS_EXAMPLE,
  MATCHED_AUTHORING_EXAMPLE,
  promptInputs,
  strataDisplaySchema,
} from "./prompt";
import { StrataSpecSchema } from "@/page-content/schema";
import { REGISTRY_VERSION, SINCE } from "@/page-content/catalog-versions";

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = join(here, "__generated__", "manifest.json");
const committed = readFileSync(committedPath, "utf8");
const promptPath = join(here, "__generated__", "authoring-prompt.txt");
const committedPrompt = readFileSync(promptPath, "utf8");

const REGENERATE = "run `pnpm gen:manifest` and commit apps/web/src/page-content/authoring/__generated__/";

describe("manifest.json", () => {
  it("is byte-identical to what the generator writes", () => {
    expect(serializeManifest(), REGENERATE).toBe(committed);
  });

  it("parses to the generated manifest", () => {
    expect(JSON.parse(committed), REGENERATE).toEqual(generateManifest());
  });
});

describe("authoring-prompt.txt", () => {
  const prompt = strataCatalog.prompt();
  const extended = displayPromptExtended(promptInputs(strataCatalog.data));

  it("is byte-identical to the custom JSON Render prompt", () => {
    expect(`${prompt}\n`, REGENERATE).toBe(committedPrompt);
  });

  it("is the compact contract an agent reads before its first write", () => {
    expect(prompt).toContain("STRATA PAGE CONTRACT");
    expect(prompt).toContain("PUT /v1/pages");
    expect(prompt).toContain("PATCH /v1/pages/{id}/spec");
    expect(prompt).toContain("GET /v1/manifest?components=");
    expect(prompt).toContain(`COMPONENTS (${COMPONENT_NAMES.length})`);
    expect(prompt).toContain("display-only unless a Reader line says otherwise");
    expect(prompt).toContain("GET /v1/guide?topic=representation");
    // Ceiling for the compact contract; extra depth belongs in the representation guide.
    expect(prompt.length).toBeLessThan(15_000);
  });

  it("puts the three chooser steps, in order, in the prompt read before the first write", () => {
    const choose = prompt.indexOf("CHOOSE — three steps, in order");
    const shape = prompt.indexOf("1. NAME THE SHAPE, TAKE THE BLOCK WITH THAT SHAPE");
    const together = prompt.indexOf("2. DECIDE WHAT MUST STAY VISIBLE TOGETHER");
    const presentation = prompt.indexOf("3. LEAVE presentation NULL UNLESS THERE IS A REASON THE DEVICE CANNOT KNOW");
    expect(choose).toBeGreaterThan(-1);
    expect(shape).toBeGreaterThan(choose);
    expect(together).toBeGreaterThan(shape);
    expect(presentation).toBeGreaterThan(together);

    expect(prompt).toContain("A card is a container with slots, not a type");
    expect(prompt).toContain("stat card = card + metric");
    expect(prompt).toContain(JSON.stringify(CARD_GRID_EXAMPLE));
    expect(prompt).toContain(CARD_CHILD_TYPES.join(", "));
    expect(prompt).toContain(GRID_CHILD_TYPES.join(", "));

    expect(prompt).toContain("THREE FIELDS THAT ARE NOT BLOCKS");
    for (const opening of ["link makes a whole card", "empty is one sentence", "sequence sits on the spec root"]) {
      expect(prompt, opening).toContain(opening);
    }
  });

  it("states each component's shape and purpose once, and Reader only when it acts", () => {
    for (const component of generateManifest().components) {
      const fullLine = `- ${component.name} [${component.shape}]: ${component.description} Reader: ${component.interaction}`;
      expect(extended.split("\n").filter((entry) => entry === fullLine)).toHaveLength(1);

      const compactLine = component.reader_acts
        ? fullLine
        : `- ${component.name} [${component.shape}]: ${component.description}`;
      expect(prompt.split("\n").filter((entry) => entry === compactLine)).toHaveLength(1);
      if (!component.reader_acts) {
        expect(prompt).not.toContain(`- ${component.name} [${component.shape}]: ${component.description} Reader:`);
      }
    }
  });

  it("reads selection copy from the actual catalog passed to JSON Render", () => {
    const entry = {
      ...strataCatalog.data.components["carousel"],
      description: "Changed purpose supplied by a scoped catalog.",
      interaction: "Changed reader control supplied by a scoped catalog.",
    };
    const scoped = defineCatalog(strataDisplaySchema, {
      components: { "carousel": entry },
      actions: {},
    });
    for (const text of [scoped.prompt(), displayPromptExtended(promptInputs(scoped.data))]) {
      expect(text).toContain(`- carousel [${entry.shape}]: ${entry.description} Reader: ${entry.interaction}`);
      expect(text).not.toContain(`- chart: ${registry.chart.meta.description}`);
    }
  });

  it("never names source_event in agent-facing text", () => {
    expect(prompt).not.toContain("source_event");
    expect(extended).not.toContain("source_event");
  });

  it("teaches the REST display profile without upstream interactive grammar", () => {
    const prompt = extended;
    expect(prompt).toContain('"elements"');
    expect(prompt).toContain("canonical JSON Render spec");
    expect(prompt).toContain("PUT /v1/pages");
    expect(prompt).toContain("REPRESENTATION PASS — do this before choosing props");
    expect(prompt).toContain("If the representation pass says a sentence is enough, do not call the page write API");
    expect(prompt).toContain("MATCHED SOURCE → ROLES → SPEC");
    expect(prompt).toContain("no chart because there is no series");
    expect(prompt).toContain("Do not optimize for component count or visual variety");
    expect(prompt).toContain("Never invent quantities, targets, categories, dates, series, axes, or trends");
    expect(prompt).toContain("Every material role and qualifier needs a faithful destination in component props");
    expect(prompt).toContain("GET /v1/manifest?components=<comma-separated names>");
    expect(prompt).toContain("complete set that reduces reader effort, not one component per extracted role");
    expect(prompt).toContain("one card per day, each holding one ascending timeline, in a carousel");
    expect(prompt).toContain("A checklist item retains its temporal gate");
    expect(prompt).toContain("Do not add a place name, category, heading");
    expect(prompt).toContain("irreducible causal explanation");
    expect(prompt).toContain("grid, up to 8 children, always two columns on a phone");
    expect(prompt).toContain(JSON.stringify(ITEM_LIST_LINKS_EXAMPLE));
    expect(prompt).toContain("Put a source-supported progress deadline in progress.target_at");
    expect(prompt).toContain("do not hide it in label text");
    expect(prompt).toContain("the write edge allows at most one per page");
    expect(prompt).not.toContain("Props:");
    expect(prompt).not.toContain("additionalProperties");
    expect(prompt).not.toContain("setState");
    expect(prompt).not.toContain("pushState");
    expect(prompt).not.toContain("JSONL");
    expect(prompt).not.toContain("on.press");
  });

  it("publishes a canonical example that the ingest schema accepts", () => {
    expect(StrataSpecSchema.safeParse(MATCHED_AUTHORING_EXAMPLE).success).toBe(true);
    expect(extended).toContain(JSON.stringify(MATCHED_AUTHORING_EXAMPLE, null, 2));
  });
});

describe("generateManifest", () => {
  const manifest = generateManifest();

  type SchemaNode = {
    type?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    properties?: Record<string, SchemaNode>;
    anyOf?: SchemaNode[];
  };

  it("declares the registry version", () => {
    expect(manifest.registry_version).toBe(REGISTRY_VERSION);
    expect(manifest.renderer).toBe("json-render");
    expect(manifest.json_render_version).toBe(packageJson.dependencies["@json-render/core"]);
    expect(manifest.json_render_directives_version)
      .toBe(packageJson.dependencies["@json-render/directives"]);
  });

  it("publishes the metric bounds enforced at ingest", () => {
    const metric = manifest.components.find((component) => component.name === "metric");
    const value = (metric?.props as SchemaNode).properties?.value;

    expect(value?.anyOf).toContainEqual(expect.objectContaining({
      type: "string",
      minLength: 1,
      maxLength: 40,
    }));
    expect(value?.anyOf).toContainEqual(expect.objectContaining({
      type: "number",
      minimum: -999_999_999_999,
      maximum: 999_999_999_999,
    }));
    expect(value?.anyOf?.some((option) => option.properties?.unit?.maxLength === 32)).toBe(true);
  });

  it("is deterministic — same registry, same bytes", () => {
    // Two real builds, bypassing the per-process cache.
    expect(serializeManifest(buildManifest())).toBe(serializeManifest(buildManifest()));
  });

  it("is built once per process", () => {
    expect(generateManifest()).toBe(generateManifest());
    expect(buildManifest()).not.toBe(generateManifest());
  });

  it("emits the components in name order, one per catalog entry", () => {
    expect(manifest.components.map((component) => component.name)).toEqual([...COMPONENT_NAMES]);
  });

  it("carries everything the guide's vocabulary section needs", () => {
    for (const component of manifest.components) {
      expect(component.since).toBe(SINCE[component.name]);
      expect(component.description).toBe(registry[component.name].meta.description);
      expect(component.interaction).toBe(registry[component.name].meta.interaction);
      expect(component.description.length).toBeGreaterThan(20);
      expect(component.interaction.length).toBeGreaterThan(20);
      expect(component.props["type"]).toBe("object");
      expect(component.props["additionalProperties"]).toBe(false);
      expect(component.example).toBeTypeOf("object");
      expect(component.slots).toEqual(
        ["card", "carousel", "grid", "section"].includes(component.name) ? ["default"] : [],
      );
      for (const pair of component.confusable_with) {
        expect(COMPONENT_NAMES).toContain(pair.name);
        expect(pair.name).not.toBe(component.name);
        expect(pair.note.length).toBeGreaterThan(20);
      }
    }
  });

  it("keeps the confusion pairs symmetric", () => {
    const pairs = new Set<string>();
    for (const component of manifest.components) {
      for (const pair of component.confusable_with) {
        pairs.add(`${component.name}→${pair.name}`);
      }
    }
    for (const key of pairs) {
      const [from, to] = key.split("→");
      expect(pairs.has(`${to}→${from}`), `missing ${to}→${from}`).toBe(true);
    }
  });

});

/**
 * `z.toJSONSchema` drops `.refine()`/`.superRefine()` rules, so each refined component must state
 * them in text. Each phrase below must appear in that component's manifest entry.
 */
describe("refined rules reach the model", () => {
  const REFINED_RULES: Record<string, readonly string[]> = {
    "approval": ["320 authored characters"],
    "attachment-list": ["may be empty only when empty is set"],
    "breakdown": ["may be empty only when empty is set"],
    "chart": [
      "at most 5 series",
      "one value per label",
      "bar presentation's floor",
      "may be empty only when empty is set",
      "must parse as an ISO-8601 date",
    ],
    "checklist": ["may be empty only when empty is set"],
    "comparison": ["may be empty only when empty is set"],
    "decision": ["one of the listed options", "setting it requires rationale"],
    "facts": ["may be empty only when empty is set"],
    "item-list": ["may be empty only when empty is set"],
    "link-button": ["exactly one of url or page_id"],
    "phases": ["contiguous and ordered"],
    "progress": ["must be greater than 0"],
    "reference-list": ["may be empty only when empty is set", "at most 20 sources"],
    "status-list": ["required when the status is waiting-on-them", "may be empty only when empty is set"],
    "streak-grid": [
      "at most 371 cells",
      "at most 371 days",
      "may be empty only when empty is set",
      "cells may name only the days with activity",
      "the last day of the days window",
    ],
    "table": ["row ids are unique", "one cell per column", "may be empty only when empty is set"],
    "timeline": ["every event needs at or time", "one time form", "may be empty only when empty is set"],
  };

  /** Components whose only unexpressed bound is a stripped `maxItems`; currently none. */
  const STRIPPED_ARRAY_BOUNDS: Record<string, readonly string[]> = {};

  function isRefined(schema: unknown): boolean {
    const def = (schema as { _zod?: { def?: { checks?: readonly unknown[] } } })._zod?.def;
    return (def?.checks?.length ?? 0) > 0;
  }

  it("has an entry for every component that refines its props", () => {
    const refined = COMPONENT_NAMES.filter((name) => isRefined(registry[name].schema));
    expect(refined).toEqual(Object.keys(REFINED_RULES));
  });

  const manifest = generateManifest();
  for (const [name, phrases] of Object.entries({ ...REFINED_RULES, ...STRIPPED_ARRAY_BOUNDS })) {
    it(`${name}: the catalog says what the refinement enforces`, () => {
      const component = manifest.components.find((entry) => entry.name === name);
      const text = `${component?.description ?? ""} ${JSON.stringify(component?.props ?? {})}`;
      for (const phrase of phrases) {
        expect(text, `${name} enforces "${phrase}" but never says so`).toContain(phrase);
      }
    });
  }
});
