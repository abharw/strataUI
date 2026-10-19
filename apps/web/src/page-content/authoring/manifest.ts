/**
 * The registry compiled into the model-facing catalog, served at `/v1/manifest` and rendered into
 * the guide. Output is deterministic; `manifest.test.ts` fails if `manifest.json` drifts.
 */
import * as z from "zod";

import { REGISTRY_VERSION } from "@/page-content/catalog-versions";
import { COMPONENT_NAMES, registry, type ComponentName } from "@/page-content/catalog";
import { strataCatalog } from "@/page-content/json-render/catalog";
import {
  JSON_RENDER_DIRECTIVES_VERSION,
  JSON_RENDER_VERSION,
} from "@/page-content/json-render/version";
import type { ConfusablePair } from "@/page-content/types";

/** Loose on purpose; the tests assert its structure (closed objects, no `oneOf`, no `$ref`). */
export type JsonSchema = Record<string, unknown>;

interface ManifestComponent {
  name: ComponentName;
  since: number;
  shape: string;
  description: string;
  interaction: string;
  reader_acts: boolean;
  confusable_with: ConfusablePair[];
  example: Record<string, unknown>;
  slots: string[];
  props: JsonSchema;
}

export interface Manifest {
  registry_version: number;
  renderer: "json-render";
  json_render_version: string;
  json_render_directives_version: string;
  components: ManifestComponent[];
}

/**
 * Input shapes only, with no `$ref`/`$defs` (strict schemas forbid recursion). Cyclic or
 * unrepresentable props fail the build instead of widening to `{}`.
 */
const TO_JSON_SCHEMA_OPTIONS = {
  target: "draft-2020-12",
  io: "input",
  reused: "inline",
  cycles: "throw",
  unrepresentable: "throw",
} as const;

/**
 * Anthropic rejects `maxItems` and `minItems` above 1, so they are stripped here. The bounds stay
 * in property descriptions and in the Zod schemas that enforce writes.
 */
function adaptArrayBounds(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) adaptArrayBounds(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const object = value as Record<string, unknown>;
  delete object.maxItems;
  if (typeof object.minItems === "number" && object.minItems > 1) {
    delete object.minItems;
  }
  for (const child of Object.values(object)) adaptArrayBounds(child);
}

/** One component's props as a bare JSON Schema fragment (no `$schema`). */
export function propsJsonSchema(name: string): JsonSchema {
  const component = strataCatalog.data.components[
    name as keyof typeof strataCatalog.data.components
  ];
  if (component === undefined) throw new Error(`unknown component "${name}"`);

  const json = z.toJSONSchema(component.props, TO_JSON_SCHEMA_OPTIONS) as JsonSchema;
  delete json["$schema"];
  adaptArrayBounds(json);
  return json;
}

/**
 * Memoized per process. `/v1/manifest` and `/v1/guide` sit behind a bearer token, so the CDN
 * cannot cache them. Callers must not mutate the result.
 */
let cached: Manifest | undefined;

export function generateManifest(): Manifest {
  return (cached ??= buildManifest());
}

/** Pure and deterministic: the same registry yields byte-identical JSON. */
export function buildManifest(): Manifest {
  return {
    registry_version: REGISTRY_VERSION,
    renderer: "json-render",
    json_render_version: JSON_RENDER_VERSION,
    json_render_directives_version: JSON_RENDER_DIRECTIVES_VERSION,
    components: COMPONENT_NAMES.map((name) => {
      const { meta } = registry[name];
      const catalogComponent = strataCatalog.data.components[name];
      return {
        name: meta.name,
        since: meta.since,
        shape: meta.shape,
        description: meta.description,
        interaction: meta.interaction,
        reader_acts: meta.readerActs === true,
        confusable_with: meta.confusable_with.map((pair) => ({
          name: pair.name,
          note: pair.note,
        })),
        example: { ...meta.example },
        slots: "slots" in catalogComponent && catalogComponent.slots !== undefined
          ? [...catalogComponent.slots]
          : [],
        props: propsJsonSchema(name),
      };
    }),
  };
}

/** The exact bytes `scripts/gen-manifest.ts` writes to `manifest.json`. */
export function serializeManifest(manifest: Manifest = generateManifest()): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
