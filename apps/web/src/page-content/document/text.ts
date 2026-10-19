/**
 * Decides which strings count as visible text for the caps in `limits.ts`. Ids, URLs, dates and
 * enums are excluded. `code-block.code` and `approval.context` are exempt from the page budget.
 */
import type { ComponentName } from "@/page-content/catalog";
import {
  MAX_ACCORDION_BODY_CHARS,
  MAX_ACCORDION_TITLE_CHARS,
  MAX_BREAKDOWN_LABEL_CHARS,
  MAX_BREAKDOWN_TOTAL_LABEL_CHARS,
  MAX_CALLOUT_CHARS,
  MAX_CARD_DESCRIPTION_CHARS,
  MAX_CARD_FOOTER_CHARS,
  MAX_CARD_TITLE_CHARS,
  MAX_CHECKLIST_LABEL_CHARS,
  MAX_CHOICE_LABEL_CHARS,
  MAX_CHOICE_QUESTION_CHARS,
  MAX_COMPARISON_HEADER_CHARS,
  MAX_COMPARISON_LABEL_CHARS,
  MAX_COMPARISON_VALUE_CHARS,
  MAX_EMPTY_CHARS,
  MAX_FACTS_LABEL_CHARS,
  MAX_FACTS_VALUE_CHARS,
  MAX_ITEM_LIST_DESCRIPTION_CHARS,
  MAX_ITEM_LIST_TITLE_CHARS,
  MAX_ITEM_LIST_VALUE_CHARS,
  MAX_METRIC_CHANGE_VALUE_CHARS,
  MAX_METRIC_VALUE_CHARS,
  MAX_NOTE_CHARS,
  MAX_PHASE_NAME_CHARS,
  MAX_PHASE_NOTE_CHARS,
  MAX_PHASE_TARGET_LABEL_CHARS,
  MAX_PROSE_CHARS,
  MAX_QUOTE_ATTRIBUTION_CHARS,
  MAX_QUOTE_CHARS,
  MAX_REFERENCE_SOURCE_CHARS,
  MAX_REFERENCE_TITLE_CHARS,
  MAX_RATIONALE_CHARS,
  MAX_TRADEOFF_CHARS,
  MAX_VALUE_LABEL_CHARS,
} from "./limits";

interface ScalarRule {
  prop: string;
  cap?: number;
  /** Read `props[parent][prop]` instead of `props[prop]`, for one nested field. */
  parent?: string;
  /** Override the field name a refusal names; defaults to `prop`. */
  label?: string;
}

interface ItemRule {
  key: string;
  cap?: number;
  /** Read `item[parent][key]` instead of `item[key]`, for one nested field. */
  parent?: string;
  /** Override the field name a refusal names; defaults to `key`. */
  label?: string;
}

interface CollectionRule {
  prop: string;
  items: ItemRule[];
}

interface ComponentTextRules {
  /** Props whose value is (or may be) a visible string. */
  scalars?: ScalarRule[];
  /** Props holding `{id, …}` items, each carrying visible strings. */
  collections?: CollectionRule[];
  /** Props holding a bare array of visible strings, e.g. chart labels. */
  lists?: ScalarRule[];
}

/**
 * Visible-text props per component. Every component needs an entry (asserted in `text.test.ts`);
 * props not listed do not count.
 */
export const TEXT_RULES: Record<ComponentName, ComponentTextRules> = {
  accordion: {
    collections: [{ prop: "items", items: [{ key: "title", cap: MAX_ACCORDION_TITLE_CHARS }, { key: "body", cap: MAX_ACCORDION_BODY_CHARS }] }],
  },
  quote: {
    scalars: [{ prop: "text", cap: MAX_QUOTE_CHARS }, { prop: "attribution", cap: MAX_QUOTE_ATTRIBUTION_CHARS }],
  },
  approval: {
    // `context` is exempt from the page budget, but the approval schema caps it.
    scalars: [{ prop: "question", cap: MAX_CHOICE_QUESTION_CHARS }],
    collections: [{ prop: "options", items: [{ key: "label", cap: MAX_CHOICE_LABEL_CHARS }] }],
  },
  "attachment-list": {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{ prop: "items", items: [{ key: "label" }, { key: "detail" }] }],
  },
  breakdown: {
    scalars: [
      { prop: "unit" },
      { prop: "total_label", cap: MAX_BREAKDOWN_TOTAL_LABEL_CHARS },
      { prop: "empty", cap: MAX_EMPTY_CHARS },
    ],
    collections: [{ prop: "parts", items: [{ key: "label", cap: MAX_BREAKDOWN_LABEL_CHARS }] }],
  },
  callout: {
    scalars: [{ prop: "text", cap: MAX_CALLOUT_CHARS }],
  },
  card: {
    // `emoji`, `media` and `link` are not prose and do not count.
    scalars: [
      { prop: "title", cap: MAX_CARD_TITLE_CHARS },
      { prop: "description", cap: MAX_CARD_DESCRIPTION_CHARS },
      { prop: "footer", cap: MAX_CARD_FOOTER_CHARS },
    ],
  },
  // Pure containers: the reader's content lives in their children's own spans.
  carousel: {},
  chart: {
    scalars: [{ prop: "y_label" }, { prop: "empty", cap: MAX_EMPTY_CHARS }],
    lists: [{ prop: "labels" }],
    // Chart values are also exposed in the chart's accessible data table.
    collections: [{ prop: "series", items: [{ key: "name" }, { key: "values" }] }],
  },
  checklist: {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{ prop: "items", items: [{ key: "label", cap: MAX_CHECKLIST_LABEL_CHARS }] }],
  },
  "code-block": {
    // `code` is exempt; the filename above it is not.
    scalars: [{ prop: "filename" }],
  },
  comparison: {
    scalars: [
      { prop: "before_label", cap: MAX_COMPARISON_HEADER_CHARS },
      { prop: "after_label", cap: MAX_COMPARISON_HEADER_CHARS },
      { prop: "empty", cap: MAX_EMPTY_CHARS },
    ],
    collections: [{
      prop: "items",
      items: [
        { key: "label", cap: MAX_COMPARISON_LABEL_CHARS },
        { key: "before", cap: MAX_COMPARISON_VALUE_CHARS },
        { key: "after", cap: MAX_COMPARISON_VALUE_CHARS },
      ],
    }],
  },
  decision: {
    scalars: [{ prop: "question", cap: MAX_CHOICE_QUESTION_CHARS }, { prop: "rationale", cap: MAX_RATIONALE_CHARS }],
    collections: [{ prop: "options", items: [{ key: "label", cap: MAX_CHOICE_LABEL_CHARS }, { key: "tradeoff", cap: MAX_TRADEOFF_CHARS }] }],
  },
  facts: {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{
      prop: "items",
      items: [
        { key: "label", cap: MAX_FACTS_LABEL_CHARS },
        { key: "value", cap: MAX_FACTS_VALUE_CHARS },
      ],
    }],
  },
  grid: {},
  "item-list": {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{
      prop: "items",
      items: [
        { key: "title", cap: MAX_ITEM_LIST_TITLE_CHARS },
        { key: "description", cap: MAX_ITEM_LIST_DESCRIPTION_CHARS },
        { key: "value", cap: MAX_ITEM_LIST_VALUE_CHARS },
      ],
    }],
  },
  "link-button": {
    scalars: [{ prop: "label" }],
  },
  metric: {
    scalars: [
      { prop: "label", cap: MAX_VALUE_LABEL_CHARS },
      { prop: "value", cap: MAX_METRIC_VALUE_CHARS },
      { prop: "change", cap: MAX_METRIC_CHANGE_VALUE_CHARS },
    ],
    lists: [{ prop: "trend" }],
  },
  phases: {
    // No `empty`: phases without stages are refused.
    scalars: [{ prop: "label", parent: "target", cap: MAX_PHASE_TARGET_LABEL_CHARS, label: "target label" }],
    collections: [{
      prop: "stages",
      items: [
        { key: "name", cap: MAX_PHASE_NAME_CHARS },
        { key: "note", cap: MAX_PHASE_NOTE_CHARS },
      ],
    }],
  },
  progress: {
    scalars: [
      { prop: "label", cap: MAX_VALUE_LABEL_CHARS },
      { prop: "current" },
      { prop: "target" },
    ],
  },
  prose: {
    scalars: [{ prop: "text", cap: MAX_PROSE_CHARS }],
  },
  "reference-list": {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{
      prop: "items",
      items: [
        { key: "title", cap: MAX_REFERENCE_TITLE_CHARS },
        { key: "source", cap: MAX_REFERENCE_SOURCE_CHARS },
        { key: "note", cap: MAX_NOTE_CHARS },
      ],
    }],
  },
  section: {
    scalars: [{ prop: "title" }],
  },
  "status-list": {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{
      prop: "items",
      items: [{ key: "label" }, { key: "owner" }, { key: "note", cap: MAX_NOTE_CHARS }],
    }],
  },
  "streak-grid": {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
  },
  table: {
    scalars: [{ prop: "key_column" }, { prop: "empty", cap: MAX_EMPTY_CHARS }],
    lists: [{ prop: "columns" }],
    collections: [{ prop: "rows", items: [{ key: "cells" }] }],
  },
  timeline: {
    scalars: [{ prop: "empty", cap: MAX_EMPTY_CHARS }],
    collections: [{
      prop: "events",
      items: [
        { key: "title" },
        { key: "note", cap: MAX_NOTE_CHARS },
        { key: "place" },
        { key: "ref" },
      ],
    }],
  },
};

/** One run of visible text and its cap. */
export interface TextSpan {
  element_id: string;
  type: string;
  /** Zod issue path, relative to the spec root. */
  path: (string | number)[];
  /** Name used in refusals, e.g. `facts value`. */
  field: string;
  text: string;
  chars: number;
  /** Per-field cap, or null where only collection and page caps apply. */
  cap: number | null;
  collection: string | null;
}

/**
 * Collection text summed across same-type siblings, which a reader meets as one list, so
 * splitting a list does not escape the collection cap.
 */
export interface SiblingCollectionText {
  parent_id: string;
  type: string;
  /** In document order. */
  element_ids: string[];
  chars: number;
  path: (string | number)[];
}

export interface CollectionText {
  element_id: string;
  type: string;
  prop: string;
  path: (string | number)[];
  chars: number;
  items: number;
}

type Element = { type: string; props: Record<string, unknown>; children?: readonly string[] };
type SpecLike = { root: string; elements: Record<string, Element> };

/** Code points, not UTF-16 units. */
export function textLength(value: string): number {
  return [...value].length;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/**
 * Locale-independent text for a displayed scalar, so formatting cannot change whether a write
 * passes. Dates and URLs count as metadata, not prose.
 */
function semanticText(value: unknown): string | null {
  if (typeof value === "string") {
    return ISO_DATE_RE.test(value) || HTTP_URL_RE.test(value) ? null : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return String(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.value === "number" && Number.isFinite(record.value)) {
    return typeof record.unit === "string" ? `${record.value} ${record.unit}` : String(record.value);
  }
  if (
    typeof record.amount === "number"
    && Number.isFinite(record.amount)
    && typeof record.currency === "string"
  ) {
    return `${record.amount} ${record.currency}`;
  }
  return null;
}

function push(spans: TextSpan[], span: TextSpan | null): void {
  if (span !== null && span.chars > 0) spans.push(span);
}

function spanOf(
  elementId: string,
  type: string,
  value: unknown,
  path: (string | number)[],
  field: string,
  cap: number | undefined,
  collection: string | null,
): TextSpan | null {
  const text = semanticText(value);
  if (text === null) return null;
  return {
    element_id: elementId,
    type,
    path,
    field,
    text,
    chars: textLength(text),
    cap: cap ?? null,
    collection,
  };
}

/** Visible text runs in one element, in document order. */
export function elementTextSpans(id: string, element: Element): TextSpan[] {
  const rules = (TEXT_RULES as Record<string, ComponentTextRules>)[element.type];
  if (rules === undefined) return [];
  const spans: TextSpan[] = [];
  const base = ["elements", id, "props"];

  for (const rule of rules.scalars ?? []) {
    const container = rule.parent === undefined
      ? element.props
      : (element.props[rule.parent] as Record<string, unknown> | null | undefined);
    const value = container !== null && typeof container === "object" && container !== undefined
      ? container[rule.prop]
      : undefined;
    push(spans, spanOf(
      id,
      element.type,
      value,
      rule.parent === undefined ? [...base, rule.prop] : [...base, rule.parent, rule.prop],
      `${element.type} ${rule.label ?? rule.prop}`,
      rule.cap,
      null,
    ));
  }

  for (const rule of rules.lists ?? []) {
    const list = element.props[rule.prop];
    if (!Array.isArray(list)) continue;
    for (const [index, entry] of list.entries()) {
      push(spans, spanOf(
        id,
        element.type,
        entry,
        [...base, rule.prop, index],
        `${element.type} ${rule.prop}`,
        rule.cap,
        rule.prop,
      ));
    }
  }

  for (const rule of rules.collections ?? []) {
    const items = element.props[rule.prop];
    if (!Array.isArray(items)) continue;
    for (const [index, item] of items.entries()) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      for (const field of rule.items) {
        const fieldContainer = field.parent === undefined
          ? record
          : (record[field.parent] as Record<string, unknown> | null | undefined);
        const value = fieldContainer !== null && typeof fieldContainer === "object" && fieldContainer !== undefined
          ? fieldContainer[field.key]
          : undefined;
        const fieldPath = field.parent === undefined
          ? [rule.prop, index, field.key]
          : [rule.prop, index, field.parent, field.key];
        // `table` rows carry an array of cells rather than one string.
        if (Array.isArray(value)) {
          for (const [cell, entry] of value.entries()) {
            push(spans, spanOf(
              id,
              element.type,
              entry,
              [...base, ...fieldPath, cell],
              `${element.type} ${field.label ?? field.key}`,
              field.cap,
              rule.prop,
            ));
          }
          continue;
        }
        push(spans, spanOf(
          id,
          element.type,
          value,
          [...base, ...fieldPath],
          `${element.type} ${field.label ?? field.key}`,
          field.cap,
          rule.prop,
        ));
      }
    }
  }

  return spans;
}

/** Visible text runs on a page, by sorted element id. */
export function textSpans(spec: SpecLike): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const id of Object.keys(spec.elements).sort()) {
    const element = spec.elements[id];
    if (element === undefined) continue;
    spans.push(...elementTextSpans(id, element));
  }
  return spans;
}

export function collectionTexts(spec: SpecLike): CollectionText[] {
  const totals = new Map<string, CollectionText>();
  for (const span of textSpans(spec)) {
    if (span.collection === null) continue;
    const key = `${span.element_id}/${span.collection}`;
    const existing = totals.get(key);
    if (existing === undefined) {
      totals.set(key, {
        element_id: span.element_id,
        type: span.type,
        prop: span.collection,
        path: ["elements", span.element_id, "props", span.collection],
        chars: span.chars,
        items: 0,
      });
    } else {
      existing.chars += span.chars;
    }
  }
  for (const total of totals.values()) {
    const items = spec.elements[total.element_id]?.props[total.prop];
    total.items = Array.isArray(items) ? items.length : 0;
  }
  return [...totals.values()];
}

/** Groups of two or more only; a lone element is already covered by `collectionTexts`. */
export function siblingCollectionTexts(spec: SpecLike): SiblingCollectionText[] {
  const parents = new Map<string, string>();
  for (const [id, element] of Object.entries(spec.elements)) {
    for (const child of element.children ?? []) {
      if (!parents.has(child)) parents.set(child, id);
    }
  }

  const groups = new Map<string, SiblingCollectionText>();
  for (const collection of collectionTexts(spec)) {
    const parentId = parents.get(collection.element_id);
    if (parentId === undefined) continue;
    const key = `${parentId}/${collection.type}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        parent_id: parentId,
        type: collection.type,
        element_ids: [collection.element_id],
        chars: collection.chars,
        path: ["elements", parentId, "children"],
      });
      continue;
    }
    group.chars += collection.chars;
    if (!group.element_ids.includes(collection.element_id)) group.element_ids.push(collection.element_id);
  }

  return [...groups.values()]
    .filter((group) => group.element_ids.length > 1)
    .map((group) => {
      const order = spec.elements[group.parent_id]?.children ?? [];
      return { ...group, element_ids: [...group.element_ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
    });
}

/** Visible body text on a page; the page budget and the `text_chars` response field. */
export function pageTextChars(spec: SpecLike): number {
  let total = 0;
  for (const span of textSpans(spec)) total += span.chars;
  return total;
}

export function textCharsByElement(spec: SpecLike): Map<string, number> {
  const totals = new Map<string, number>();
  for (const span of textSpans(spec)) {
    totals.set(span.element_id, (totals.get(span.element_id) ?? 0) + span.chars);
  }
  return totals;
}
