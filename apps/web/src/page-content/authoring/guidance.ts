/**
 * Pure authoring-quality checks on a candidate write. Most are advisory; literal Markdown/HTML,
 * a summary copied verbatim into the body, and a second quote must be repaired before storing.
 */
import type { StrataSpec } from "@/page-content/schema";
import { GUIDE_NODES, MAX_BREAKDOWN_PARTS } from "@/page-content/document/limits";
import { elementTextSpans, textCharsByElement, textLength, textSpans } from "@/page-content/document/text";
import { jsonPointer } from "@/shared/api/json-pointer";

type GuidanceIssueLevel = "advisory" | "repair_required";

type GuidanceIssueCode =
  | "element_count"
  | "component_monotony"
  | "summary_body_duplication"
  | "literal_markup"
  | "multiple_quotes"
  | "component_choice"
  | "address_drift";

/** A stable machine handle beside the prose an author can act on. */
export interface GuidanceIssue {
  code: GuidanceIssueCode;
  level: GuidanceIssueLevel;
  message: string;
  /**
   * JSON Pointer into the document (`/answer`, `/root`, `/elements`) or request (`/summary`,
   * `/title`). API handlers prefix `/spec` when the request nests the document.
   */
  path?: string;
}

/** Model-authored chrome evaluated with the candidate document. */
export interface GuidanceContext {
  summary: string;
  title?: string;
}

type GuidanceInput = string | GuidanceContext;

function contextOf(input: GuidanceInput): GuidanceContext {
  return typeof input === "string" ? { summary: input } : input;
}

function issue(
  code: GuidanceIssueCode,
  level: GuidanceIssueLevel,
  message: string,
  path?: string,
): GuidanceIssue {
  return { code, level, message, ...(path === undefined ? {} : { path }) };
}

/** Containers do not count toward repetition. */
const CONTAINER_TYPES = new Set(["section", "grid", "carousel"]);

const MONOTONY_COUNT = 4;

const MONOTONY_TEXT_SHARE = 0.5;

/** Below this much text, a dominant type is just a short page. */
const MONOTONY_TEXT_FLOOR = 500;

/** Share of the summary's word triples that may reappear in the body. */
const DUPLICATION_SHARE = 0.5;

/** Types whose text a summary can duplicate. */
const NARRATIVE_TYPES = new Set(["prose", "callout"]);

/**
 * Visible text renders literally, so Markdown/HTML shows its markers. `code-block.code` is not a
 * visible-text span and is never checked.
 */
const MARKDOWN_PATTERNS: readonly [RegExp, string][] = [
  [/(?:^|\n)\s*#{1,6}\s+\S/, "a Markdown heading"],
  [/(?:^|\n)\s*[-*+]\s+\S/, "a Markdown bullet"],
  [/(?:^|\n)\s*\d+\.\s+\S/, "a Markdown numbered list"],
  [/(?:^|\n)\s*>\s+\S/, "a Markdown blockquote"],
  [/```/, "a Markdown code fence"],
  [/(?:^|\n)\s*~{3,}[^\n]*(?=\n|$)/, "a Markdown code fence"],
  [/`[^`\n]+`/, "inline-code markers"],
  [/\*\*[^*\n]+\*\*/, "bold markers"],
  [/~~[^~\n]+~~/, "strikethrough markers"],
  [/(?<!\*)\*(?![\s*])[^*\n]*?\S\*(?!\*)/, "italic markers"],
  [/(?<![\p{L}\p{N}_])_(?![\s_])[^_\n]*?\S_(?![\p{L}\p{N}_])/u, "italic markers"],
  [/(?:^|\n)\s*(?:-{3,}|\*{3,}|_{3,})\s*(?=\n|$)/, "a Markdown thematic break"],
  [/(?:^|\n)\s*\S[^\n]*\n\s*={3,}\s*(?=\n|$)/, "a Markdown Setext heading"],
  [/(?:^|\n)\s*\|?[^\n|]+\|[^\n]*\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*(?=\n|$)/, "a Markdown table"],
  [/\[[^\]\n]+\]\([^)\n]+\)/, "a Markdown link"],
  [/<(?:https?:\/\/|mailto:)[^<>\s]+>/i, "a Markdown autolink"],
  [/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>\n]*?)?\s*\/?>/, "an HTML tag"],
  [/<!--[\s\S]*?-->|<!DOCTYPE\s+[^>]+>/i, "HTML markup"],
  [/&(?:[A-Za-z][A-Za-z0-9]+|#\d+|#x[0-9A-Fa-f]+);/, "an HTML entity"],
];

/** Whether plain visible text carries markup this renderer does not parse. */
export function hasLiteralMarkup(text: string): boolean {
  return MARKDOWN_PATTERNS.some(([pattern]) => pattern.test(text));
}

function markdownIssue(spec: StrataSpec, context: GuidanceContext): GuidanceIssue | null {
  const hits: { detail: string; path: string }[] = [];
  const record = (text: string, detail: string, path: string): void => {
    const found = MARKDOWN_PATTERNS.filter(([pattern]) => pattern.test(text));
    if (found.length > 0) {
      hits.push({ detail: `${detail} (${found.map(([, name]) => name).join(", ")})`, path });
    }
  };
  record(context.summary, "write summary", "/summary");
  if (context.title !== undefined) record(context.title, "page title", "/title");
  if (spec.answer !== undefined) {
    record(spec.answer.verdict, "answer verdict", "/answer/verdict");
  }
  for (const span of textSpans(spec)) {
    record(span.text, `${span.field} in "${span.element_id}"`, jsonPointer(span.path));
    if (hits.length >= 3) break;
  }
  // approval.context is exempt from the text budget but still renders as plain text.
  for (const [id, element] of Object.entries(spec.elements)) {
    if (element.type !== "approval" || typeof element.props.context !== "string") continue;
    record(element.props.context, `approval context in "${id}"`, jsonPointer(["elements", id, "props", "context"]));
    if (hits.length >= 3) break;
  }
  if (hits.length === 0) return null;
  return issue(
    "literal_markup",
    "repair_required",
    `Markdown or HTML renders literally here - ${hits.map(({ detail }) => detail).join("; ")}. The reader sees the markers, not the formatting: `
      + "use the component that renders the shape (a list is a checklist or facts, a link is link-button, emphasis is the answer field or a metric), or drop the markers.",
    hits[0].path,
  );
}

/** What a rewrite did to the page's addresses: the drift a patch cannot cause. */
export interface AddressDrift {
  elements_dropped: number;
  elements_renamed: number;
  warnings: string[];
}

/**
 * Element ids are stable addresses. A full rewrite bypasses the patch grammar, so this flags
 * renames (same type and leading text under a new id) and outright drops.
 */
export function addressDrift(before: StrataSpec, after: StrataSpec): AddressDrift {
  const signature = (spec: StrataSpec, id: string): string | null => {
    const element = spec.elements[id];
    if (element === undefined) return null;
    const firstText = elementTextSpans(id, element).find((span) => span.chars > 0)?.text ?? "";
    // Text-free elements would all share one signature, so they are unmatchable.
    if (firstText === "") return null;
    return `${element.type}\0${firstText.slice(0, 120)}`;
  };
  const beforeIds = new Set(Object.keys(before.elements));
  const afterIds = new Set(Object.keys(after.elements));
  const droppedIds = [...beforeIds].filter((id) => !afterIds.has(id));
  const addedIds = [...afterIds].filter((id) => !beforeIds.has(id));

  const addedBySignature = new Map<string, string[]>();
  for (const id of addedIds) {
    const sig = signature(after, id);
    if (sig === null) continue;
    addedBySignature.set(sig, [...(addedBySignature.get(sig) ?? []), id]);
  }
  const renames: [string, string][] = [];
  let dropped = 0;
  for (const id of droppedIds) {
    const sig = signature(before, id);
    const candidates = sig === null ? undefined : addedBySignature.get(sig);
    if (candidates !== undefined && candidates.length > 0) {
      renames.push([id, candidates.shift()!]);
    } else {
      dropped += 1;
    }
  }

  const warnings: string[] = [];
  if (renames.length > 0) {
    const examples = renames.slice(0, 3).map(([from, to]) => `"${from}" became "${to}"`).join(", ");
    warnings.push(
      `This rewrite renamed ${renames.length} element${renames.length === 1 ? "" : "s"} that kept their content (${examples}). `
      + "An element's id is its address: renaming it is the page moving while the reader watches. Reuse the existing ids "
      + "and reserve new ones for content that is actually new.",
    );
  }
  if (dropped > 0) {
    warnings.push(
      `This rewrite dropped ${dropped} element${dropped === 1 ? "" : "s"} outright. A patch has to name what it removes - `
      + "if the rewrite is a rebuild rather than a replacement, say so in the summary so the reader's history reads honestly.",
    );
  }
  return { elements_dropped: dropped, elements_renamed: renames.length, warnings };
}

function counts<T>(values: Iterable<T>): Map<T, number> {
  const totals = new Map<T, number>();
  for (const value of values) totals.set(value, (totals.get(value) ?? 0) + 1);
  return totals;
}

/** Lowercased word triples. */
function shingles(text: string, size = 3): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const out = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) {
    out.add(words.slice(index, index + size).join(" "));
  }
  return out;
}

/** Same tokenization as shingles, retained in order for exact containment. */
function normalizedWords(text: string): string {
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).join(" ");
}

/**
 * Grid and carousel children (and the content of their cards) are repeated by design, so they
 * are excluded from monotony checks. Loose cards elsewhere still count.
 */
function compositionOwnedContent(spec: StrataSpec): Set<string> {
  const owned = new Set<string>();
  for (const element of Object.values(spec.elements)) {
    if (element.type !== "grid" && element.type !== "carousel") continue;
    for (const child of element.children ?? []) {
      owned.add(child);
      if (spec.elements[child]?.type === "card") {
        for (const grandchild of spec.elements[child]?.children ?? []) owned.add(grandchild);
      }
    }
  }
  return owned;
}

function monotonyWarning(spec: StrataSpec): string | null {
  const composedContent = compositionOwnedContent(spec);
  const contentIds = Object.keys(spec.elements)
    .filter((id) => !CONTAINER_TYPES.has(spec.elements[id].type) && !composedContent.has(id));
  // Approvals are exempt: each open question needs its own element.
  const byType = counts(contentIds.map((id) => spec.elements[id].type).filter((type) => type !== "approval"));
  const repeated = [...byType.entries()]
    .filter(([, count]) => count >= MONOTONY_COUNT)
    .sort((left, right) => right[1] - left[1])[0];
  if (repeated !== undefined) {
    return `This page uses ${repeated[0]} ${repeated[1]} times. Repetition can make related content easier to scan. `
      + "If it makes the reader repeat work or hides a useful comparison, reconsider the grouping or presentation; "
      + "otherwise keep the consistent shape.";
  }

  const charsByElement = textCharsByElement(spec);
  const total = [...charsByElement.values()].reduce((sum, chars) => sum + chars, 0);
  if (total < MONOTONY_TEXT_FLOOR) return null;
  const byTypeChars = new Map<string, number>();
  for (const [id, chars] of charsByElement) {
    const type = spec.elements[id]?.type;
    if (type === undefined || CONTAINER_TYPES.has(type) || composedContent.has(id)) continue;
    byTypeChars.set(type, (byTypeChars.get(type) ?? 0) + chars);
  }
  for (const [type, chars] of byTypeChars) {
    if (chars / total <= MONOTONY_TEXT_SHARE) continue;
    return `${type} holds ${Math.round((chars / total) * 100)}% of this page's text. That may suit the reader's task. `
      + "If finding or comparing information takes unnecessary reading, reconsider the grouping or presentation; "
      + "do not add variety solely to lower this share.";
  }
  return null;
}

/** The summary is the delta and the body is the state, so overlap repeats itself to the reader. */
function duplicationObservation(spec: StrataSpec, summary: string): { message: string; verbatim: boolean } | null {
  const summaryShingles = shingles(summary);
  if (summaryShingles.size === 0) return null;
  const narrativeSpans = textSpans(spec).filter((span) => NARRATIVE_TYPES.has(span.type));
  const body = narrativeSpans.map((span) => span.text).join("\n");
  if (textLength(body) === 0) return null;
  const bodyShingles = shingles(body);
  let shared = 0;
  for (const shingle of summaryShingles) if (bodyShingles.has(shingle)) shared += 1;
  const share = shared / summaryShingles.size;
  if (share < DUPLICATION_SHARE) return null;
  const normalizedSummary = normalizedWords(summary);
  const verbatim = normalizedSummary !== ""
    && narrativeSpans.some((span) => normalizedWords(span.text).includes(normalizedSummary));
  return {
    message: `${Math.round(share * 100)}% of this write's summary is repeated verbatim in the page body. The summary is `
      + "the chrome's what-changed strip; the body is the state now. A reader who has just read the delta above should "
      + "not meet it again as a paragraph - cut it from the body, or make the summary name the concrete change.",
    // Partial overlap stays advisory; only the whole summary inside one passage blocks the write.
    verbatim,
  };
}

/** The catalog allows one quote per page. */
function multipleQuotesIssue(spec: StrataSpec): GuidanceIssue | null {
  const quoteIds = Object.keys(spec.elements)
    .filter((id) => spec.elements[id]?.type === "quote")
    .sort();
  if (quoteIds.length <= 1) return null;
  return issue(
    "multiple_quotes",
    "repair_required",
    `This page has ${quoteIds.length} quotes (${quoteIds.join(", ")}), but quote is one voice per page. Keep the one quote that changes the reader's understanding; move supporting evidence into reference-list and paraphrase any necessary facts into typed elements.`,
    jsonPointer(["elements", quoteIds[1]]),
  );
}

/**
 * Column headings meaning "before" and "after". A literal match avoids flagging ordinary
 * three-column tables as `comparison` candidates.
 */
const BEFORE_WORDS = new Set(["was", "before", "old", "previous", "prior", "current", "then", "from", "baseline"]);
const AFTER_WORDS = new Set(["now", "after", "new", "proposed", "revised", "updated", "to", "target"]);

function columnNames(element: StrataSpec["elements"][string]): string[] | null {
  const columns = element.props.columns;
  if (!Array.isArray(columns)) return null;
  return columns.every((column) => typeof column === "string") ? columns : null;
}

/**
 * Advisory hints toward `facts`, `item-list`, `comparison` or `breakdown` when a table or chart
 * has a shape one of them fits better.
 */
function componentChoiceIssues(spec: StrataSpec): GuidanceIssue[] {
  const out: GuidanceIssue[] = [];
  for (const id of Object.keys(spec.elements).sort()) {
    const element = spec.elements[id];
    const rows = Array.isArray(element.props.rows) ? element.props.rows : null;
    if (element.type === "table" && rows !== null && rows.length === 1) {
      out.push(issue(
        "component_choice",
        "advisory",
        `The table "${id}" has one row, so there is no comparison between rows. One thing's named values are `
          + "usually a facts block, which stacks a long value instead of scrolling it sideways; a row that is a title "
          + "and one trailing number is usually an item-list. Keep this table if the reader really is comparing across "
          + "its columns. Preserve the values; do not add filler rows.",
        jsonPointer(["elements", id, "props", "rows"]),
      ));
      continue;
    }
    const columns = element.type === "table" ? columnNames(element) : null;
    if (columns !== null && columns.length === 2 && rows !== null && rows.length > 1) {
      out.push(issue(
        "component_choice",
        "advisory",
        `The table "${id}" has two columns, which is the shape item-list is for: a title the reader scans and one `
          + "value flush to the trailing edge, with room for a supporting line, a thumbnail and a per-row link "
          + "that a table cell cannot carry. Keep the table if both columns are values the reader compares.",
        jsonPointer(["elements", id, "props", "columns"]),
      ));
      continue;
    }
    if (
      columns !== null && columns.length === 3
      && BEFORE_WORDS.has(columns[1].trim().toLowerCase())
      && AFTER_WORDS.has(columns[2].trim().toLowerCase())
    ) {
      out.push(issue(
        "component_choice",
        "advisory",
        `The table "${id}" is a before and an after on named rows ("${columns[1]}" then "${columns[2]}"), which is `
          + "what comparison is for: it stacks each pair on a phone instead of putting a third column off the edge of "
          + "the screen. Keep the table if the reader needs all three columns aligned at once.",
        jsonPointer(["elements", id, "props", "columns"]),
      ));
      continue;
    }
    // Only flag the unambiguous case: percent-stacking one series draws every label at 100%.
    if (element.type === "chart" && element.props.stack === "percent") {
      const series = Array.isArray(element.props.series) ? element.props.series : null;
      const parts = Array.isArray(element.props.labels) ? element.props.labels.length : 0;
      if (series !== null && series.length === 1) {
        out.push(issue(
          "component_choice",
          "advisory",
          `The chart "${id}" stacks one series to percent, which normalises every label to 100% and draws nothing. `
            + "Parts of one whole are a breakdown: it names the slices, can carry the total in the middle, and falls "
            + `back to honest bars when there are many small parts${
              parts > MAX_BREAKDOWN_PARTS ? ` - though ${String(parts)} labels is over its ${String(MAX_BREAKDOWN_PARTS)}-part cap, so decide which parts matter first` : ""
            }. Keep the chart and drop the stack if the question is how the labels compare, not how they divide something.`,
          jsonPointer(["elements", id, "props", "stack"]),
        ));
      }
    }
  }
  return out;
}

/** All guidance issues for a candidate write. */
export function guidanceIssues(spec: StrataSpec, input: GuidanceInput, drift?: AddressDrift): GuidanceIssue[] {
  const context = contextOf(input);
  const issues: GuidanceIssue[] = [];
  const count = Object.keys(spec.elements).length;
  if (count > GUIDE_NODES) {
    issues.push(issue(
      "element_count",
      "advisory",
      `This page has ${count} elements; aim for ${GUIDE_NODES} or fewer. Split only when content needs a different `
        + "cadence, writer, audience, or grows beyond one useful page.",
      "/elements",
    ));
  }
  const monotony = monotonyWarning(spec);
  if (monotony !== null) issues.push(issue("component_monotony", "advisory", monotony, "/elements"));

  const duplication = duplicationObservation(spec, context.summary);
  if (duplication !== null) {
    issues.push(issue(
      "summary_body_duplication",
      duplication.verbatim ? "repair_required" : "advisory",
      duplication.message,
      "/summary",
    ));
  }
  const markup = markdownIssue(spec, context);
  if (markup !== null) issues.push(markup);
  const quotes = multipleQuotesIssue(spec);
  if (quotes !== null) issues.push(quotes);
  issues.push(...componentChoiceIssues(spec));
  if (drift !== undefined) {
    issues.push(...drift.warnings.map((message) => issue("address_drift", "advisory", message, "/elements")));
  }
  return issues;
}

/** Issues that block the write. */
export function repairRequiredIssues(spec: StrataSpec, input: GuidanceInput): GuidanceIssue[] {
  return guidanceIssues(spec, input).filter(({ level }) => level === "repair_required");
}

/** String projection of `guidanceIssues` for write responses. */
export function guidanceWarnings(spec: StrataSpec, input: GuidanceInput, drift?: AddressDrift): string[] {
  return guidanceIssues(spec, input, drift).map(({ message }) => message);
}
