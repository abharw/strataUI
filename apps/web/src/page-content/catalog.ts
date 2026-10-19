/**
 * The component registry, the only place the catalog is enumerated. The renderer ships with the
 * server, so a stale catalog lives with the writer; unknown types are rejected at ingest.
 */
import { zodErrors } from "@/shared/api/errors";
import type { ComponentDefinition, PropsValidationResult, ValidationIssue } from "./types";

import { meta as accordionMeta, schema as accordionSchema } from "@/page-content/blocks/accordion/schema";
import { meta as approvalMeta, schema as approvalSchema } from "@/page-content/blocks/approval/schema";
import { meta as attachmentListMeta, schema as attachmentListSchema } from "@/page-content/blocks/attachment-list/schema";
import { meta as breakdownMeta, schema as breakdownSchema } from "@/page-content/blocks/breakdown/schema";
import { meta as calloutMeta, schema as calloutSchema } from "@/page-content/blocks/callout/schema";
import { meta as cardMeta, schema as cardSchema } from "@/page-content/blocks/card/schema";
import { meta as carouselMeta, schema as carouselSchema } from "@/page-content/blocks/carousel/schema";
import { meta as chartMeta, schema as chartSchema } from "@/page-content/blocks/chart/schema";
import { meta as checklistMeta, schema as checklistSchema } from "@/page-content/blocks/checklist/schema";
import { meta as codeBlockMeta, schema as codeBlockSchema } from "@/page-content/blocks/code-block/schema";
import { meta as comparisonMeta, schema as comparisonSchema } from "@/page-content/blocks/comparison/schema";
import { meta as decisionMeta, schema as decisionSchema } from "@/page-content/blocks/decision/schema";
import { meta as factsMeta, schema as factsSchema } from "@/page-content/blocks/facts/schema";
import { meta as gridMeta, schema as gridSchema } from "@/page-content/blocks/grid/schema";
import { meta as itemListMeta, schema as itemListSchema } from "@/page-content/blocks/item-list/schema";
import { meta as linkButtonMeta, schema as linkButtonSchema } from "@/page-content/blocks/link-button/schema";
import { meta as metricMeta, schema as metricSchema } from "@/page-content/blocks/metric/schema";
import { meta as phasesMeta, schema as phasesSchema } from "@/page-content/blocks/phases/schema";
import { meta as progressMeta, schema as progressSchema } from "@/page-content/blocks/progress/schema";
import { meta as proseMeta, schema as proseSchema } from "@/page-content/blocks/prose/schema";
import { meta as quoteMeta, schema as quoteSchema } from "@/page-content/blocks/quote/schema";
import { meta as referenceListMeta, schema as referenceListSchema } from "@/page-content/blocks/reference-list/schema";
import { meta as sectionMeta, schema as sectionSchema } from "@/page-content/blocks/section/schema";
import { meta as statusListMeta, schema as statusListSchema } from "@/page-content/blocks/status-list/schema";
import { meta as streakGridMeta, schema as streakGridSchema } from "@/page-content/blocks/streak-grid/schema";
import { meta as tableMeta, schema as tableSchema } from "@/page-content/blocks/table/schema";
import { meta as timelineMeta, schema as timelineSchema } from "@/page-content/blocks/timeline/schema";

/**
 * Keyed by element `type`. `json-render/registry.tsx` is a required mapped type over this, so a
 * component added here without a renderer is a compile error.
 */
export const registry = {
  "accordion": { schema: accordionSchema, meta: accordionMeta },
  "approval": { schema: approvalSchema, meta: approvalMeta },
  "attachment-list": { schema: attachmentListSchema, meta: attachmentListMeta },
  "breakdown": { schema: breakdownSchema, meta: breakdownMeta },
  "callout": { schema: calloutSchema, meta: calloutMeta },
  "card": { schema: cardSchema, meta: cardMeta },
  "carousel": { schema: carouselSchema, meta: carouselMeta },
  "chart": { schema: chartSchema, meta: chartMeta },
  "checklist": { schema: checklistSchema, meta: checklistMeta },
  "code-block": { schema: codeBlockSchema, meta: codeBlockMeta },
  "comparison": { schema: comparisonSchema, meta: comparisonMeta },
  "decision": { schema: decisionSchema, meta: decisionMeta },
  "facts": { schema: factsSchema, meta: factsMeta },
  "grid": { schema: gridSchema, meta: gridMeta },
  "item-list": { schema: itemListSchema, meta: itemListMeta },
  "link-button": { schema: linkButtonSchema, meta: linkButtonMeta },
  "metric": { schema: metricSchema, meta: metricMeta },
  "phases": { schema: phasesSchema, meta: phasesMeta },
  "progress": { schema: progressSchema, meta: progressMeta },
  "prose": { schema: proseSchema, meta: proseMeta },
  "quote": { schema: quoteSchema, meta: quoteMeta },
  "reference-list": { schema: referenceListSchema, meta: referenceListMeta },
  "section": { schema: sectionSchema, meta: sectionMeta },
  "status-list": { schema: statusListSchema, meta: statusListMeta },
  "streak-grid": { schema: streakGridSchema, meta: streakGridMeta },
  "table": { schema: tableSchema, meta: tableMeta },
  "timeline": { schema: timelineSchema, meta: timelineMeta },
} as const satisfies Record<string, ComponentDefinition>;

export type ComponentName = keyof typeof registry;

/** Sorted, the order the manifest uses. */
export const COMPONENT_NAMES: readonly ComponentName[] = (
  Object.keys(registry) as ComponentName[]
).sort();

export function isComponentName(name: string): name is ComponentName {
  return Object.prototype.hasOwnProperty.call(registry, name);
}

const OK: PropsValidationResult = { ok: true, issues: [] };

/** Validates one element's props. Unknown types are already refused by the spec schema. */
export function validateProps(name: ComponentName, props: unknown): PropsValidationResult {
  const result = registry[name].schema.safeParse(props);
  if (result.success) return OK;

  // The shared shaper unwraps union and record-key failures into readable messages. Only the
  // text is kept; the API edge adds pointers once it knows the element.
  const shaped = zodErrors(result.error, { next: ["get_manifest"] });
  const issues: ValidationIssue[] = result.error.issues.map((issue, index) => ({
    path: [...issue.path],
    message: shaped[index].error,
  }));
  return { ok: false, issues };
}

export type { ComponentDefinition, PropsValidationResult } from "./types";
