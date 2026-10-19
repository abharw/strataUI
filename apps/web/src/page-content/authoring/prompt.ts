import { defineSchema, type PromptContext, type PromptOptions } from "@json-render/core";
import type { ComponentMeta } from "@/page-content/types";

import { fieldBudgetSentence } from "@/page-content/authoring/field-budget";
import { CARD_CHILD_TYPES, CAROUSEL_CHILD_TYPES, GRID_CHILD_TYPES } from "@/page-content/document/composition";
import {
  MAX_ANSWER_VERDICT_CHARS,
  MAX_APPROVAL_COPY_CHARS,
  MAX_BODY_BYTES,
  MAX_CAROUSEL_CHILDREN,
  MAX_CHOICE_LABEL_CHARS,
  MAX_COLLECTION_TEXT_CHARS,
  MAX_DEPTH,
  MAX_EMPTY_CHARS,
  MAX_GRID_CHILDREN,
  MAX_ITEMS_PER_COLLECTION,
  MAX_METRIC_ABSOLUTE_VALUE,
  MAX_NODES_HARD,
  MAX_PATCH_OPS,
  MAX_PROSE_CHARS,
  PAGE_TEXT_BUDGET,
} from "@/page-content/document/limits";

/** Both prompt templates read the same catalog metadata as the manifest. */
export type PromptInputs = Pick<PromptContext, "catalog" | "componentNames" | "options">;

interface SelectionCatalog {
  components: Readonly<Record<string, Pick<ComponentMeta, "description" | "interaction" | "shape" | "readerActs">>>;
}

/** Inputs for the extended template, built from the catalog that drives the compact one. */
export function promptInputs(
  catalog: SelectionCatalog,
  options: PromptOptions = {},
): PromptInputs {
  return { catalog, componentNames: Object.keys(catalog.components).sort(), options };
}

/** Worked card-grid example, published verbatim in chooser step 2. */
export const CARD_GRID_EXAMPLE = {
  units: { type: "grid", props: {}, children: ["bergen", "carroll"] },
  bergen: {
    type: "card",
    props: { title: "Bergen St", description: "2BR", footer: "$2,150/mo" },
    children: ["bergen-walk"],
  },
  "bergen-walk": {
    type: "metric",
    props: { label: "Walk to office", value: { value: 12, unit: "min" } },
  },
  carroll: {
    type: "card",
    props: { title: "Carroll St", description: "2BR", footer: "$2,400/mo" },
    children: ["carroll-walk"],
  },
  "carroll-walk": {
    type: "metric",
    props: { label: "Walk to office", value: { value: 8, unit: "min" } },
  },
} as const;

/** Worked item-list example with trailing values and per-row links. */
export const ITEM_LIST_LINKS_EXAMPLE = {
  type: "item-list",
  props: {
    items: [
      {
        id: "kitchen",
        title: "Kitchen backsplash",
        value: { amount: 840, currency: "USD" },
        link: { url: "https://example.com/quotes/backsplash" },
      },
      {
        id: "floors",
        title: "Floor refinish",
        description: "Booked, two coats, three days curing",
        value: { amount: 2100, currency: "USD" },
        link: { url: "https://example.com/quotes/floors" },
      },
    ],
  },
} as const;

/**
 * The three-step component chooser. Containment rules are interpolated from `composition.ts`
 * and `limits.ts` so the prompt matches what the write edge enforces.
 */
const CHOOSE_STEPS = [
  "Start from what the reader needs to understand or do. If the request only supplies data, infer a useful reading task from its meaning; do not treat the source format as a request to reproduce it. Respect any stated task or interaction; preserve the supplied facts, units, gaps and uncertainty.",
  "1. NAME THE SHAPE, TAKE THE BLOCK WITH THAT SHAPE. Say in one phrase what the data is - one value; named values; rows with a title and a trailing value; records on shared fields; values over shared labels; parts of a whole - and match that phrase to the one in square brackets on a component line. A picture is not a shape: a line and a bar are one chart because they take the same data, and a donut is a breakdown because parts of a whole is different data. If two phrases fit, the data has two shapes; use two blocks.",
  `2. DECIDE WHAT MUST STAY VISIBLE TOGETHER, THEN PICK THE CONTAINER. Judge that by effort on a narrow phone - the reading, scrolling, opening and remembering it takes to reach the answer - not by component count. Keep the values a comparison needs visible at once; give substantial per-item detail the width to read it.
  - Nothing has to be held together: siblings in a section, the default; the root is always one.
  - One thing needs its own surface, heading, picture, tag or tap target: card. A card is a container with slots, not a type - stat card = card + metric, cover card = card with media. A child must be one of: ${CARD_CHILD_TYPES.join(", ")}. No container nests inside a card. Zero children is valid when title or media is present.
  - A few compact peers must stay visible for comparison: grid, up to ${MAX_GRID_CHILDREN} children, always two columns on a phone. A child must be one of: ${GRID_CHILD_TYPES.join(", ")}, and a card in a grid holds one block. Bars, rows, axes and sentences need the width of a section.
  - Peers are inspected one at a time and the set need not stay visible: carousel, up to ${MAX_CAROUSEL_CHILDREN} children, every one a ${CAROUSEL_CHILD_TYPES.join(", ")}.
  Two apartments as a card grid, each card carrying a title, a footer and one metric:
  ${JSON.stringify(CARD_GRID_EXAMPLE)}`,
  `3. LEAVE presentation NULL UNLESS THERE IS A REASON THE DEVICE CANNOT KNOW. Null means the device picks from the data and the screen. Name one only when you know something the data does not say, and a presentation the person explicitly asked for counts as a reason. What null already does:
  - chart: time labels give a line, or an area when stacked; category labels give a bar, grouped for several series, horizontal for one series whose labels run over 12 characters.
  - breakdown: a donut when total_label is set or there are five parts or fewer; bars otherwise, because bars are the honest phone rendering of many small parts.
  - facts: inline when every value is 40 characters or shorter, stacked when any is longer.
  - table: grid up to three columns; records - each row a stacked block headed by its key_column - beyond that on a phone.
  - item-list: rows; ask for by-day (one dated day on screen, opened on the reader's today, stepped with previous and next) when every row carries on and the reader wants a day at a time. progress: bar. attachment-list: gallery when every item is a host-verified image, list otherwise.`,
] as const;

/** `link`, `empty` and `sequence`: fields shared across blocks rather than blocks themselves. */
const CROSS_CUTTING_RULES = [
  "link makes a whole card, an item-list row, a timeline event or a checklist step's label tappable, and the renderer draws the affordance. It is exactly one of {\"page\":\"<the uuid GET /v1/pages returned>\"} or {\"url\":\"https://…\"} - never a share URL, because the server resolves a page link into the reader's own keyed URL and renders it unlinked for a reader who cannot reach it. link-button remains the page's one prominent destination.",
  `empty is one sentence of at most ${MAX_EMPTY_CHARS} characters shown in place of a collection with no items, and every block with an items array takes it. An items array may be empty only when empty is set, and may not carry empty when it has items. This is the honesty field: "No workouts logged yet" beats an invented row. phases is the exception - its stages are required, so an empty one is a schema error.`,
  "sequence sits on the spec root beside answer, root and elements, never on a block: {\"up\":<link>,\"position\":<n>}, or {\"previous\":<link>,\"next\":<link>,\"up\":<link>}. The chrome draws it under the title as the page's pager, labelled from the target pages' titles at read time, so a Week belongs to its Plan without a navigation block. Prefer up plus position: previous and next are derived from the siblings sharing that up, so a plan's pages are written in one pass knowing only the parent's id; write previous or next only when the chain is not siblings. It is one-way: give the parent an item-list of linked rows.",
] as const;

/**
 * Display rules shared by the JSON Render prompt and the REST guide. Objective constraints are
 * validated at ingest; selection guidance is advisory.
 */
export const DISPLAY_AUTHORING_RULES = [
  ...CHOOSE_STEPS,
  ...CROSS_CUTTING_RULES,
  "Put the useful overview or main answer first, with supporting detail easy to reach. Do not add widgets for variety, repeat the same data unnecessarily, or require swiping through bare values to compare them.",
  "The root element is section and carries no title of its own - a root section with a title prop is refused. App chrome owns the page title, navigation, provenance, actions, offline state, and recent changes; never reproduce chrome inside the page body.",
  "One page answers one question: where do we stand with this? If structured state, stable position, or typed compression do not beat a short message, do not create a page.",
  `Every spec carries answer:{verdict} beside root and elements. The verdict is the page's TLDR: that one question's answer in at most ${MAX_ANSWER_VERDICT_CHARS} characters - the page's standing state, what it says when nothing has changed. It is not the write summary, which is this write's delta. A spec without one is refused. When the answer captures information from a specific day, say so in the text ("Prices as of Aug 28: …") - the chrome already shows when the page was last written.`,
  `${fieldBudgetSentence("prompt")} Write with slack instead of sitting on a limit. A raw metric figure may not exceed ${MAX_METRIC_ABSOLUTE_VALUE.toLocaleString("en-US")}; summarize larger values with a compact unit. An approval may carry ${MAX_APPROVAL_COPY_CHARS} authored characters in total, counting each field once. code-block code and approval context are exempt only from the page-wide budget; their own caps still apply. Over any cap the write is refused, not trimmed: compress, move the detail to a second page, or drop it. One list is one collection, and same-type sibling collections under one parent are summed against that single ${MAX_COLLECTION_TEXT_CHARS}-character budget: two facts blocks side by side are refused exactly as one over-long facts block is, so splitting a list is not a way around the counter - it only costs the reader the one scannable list.`,
  `prose is the one sustained passage a page may hold: at most ${MAX_PROSE_CHARS} characters, one per page, and never the root's first child - the first thing on the page is the current answer, not a paragraph about it.`,
  "When prose is needed for an irreducible causal explanation, it must stand on its own: keep the condition, consequence, and exception in that one passage even if the decision above briefly summarizes the condition. This narrow repetition preserves meaning; moving a defining clause only into decision.rationale breaks the explanation.",
  "The first phone viewport supports the page's answer with the representation that serves the reader's task. A chart, timeline, comparison, or focused peer can lead when it carries that answer; do not prepend a metric merely to satisfy a layout recipe.",
  "A semantic component owns every source fact that qualifies its claim; answer.verdict is a summary, not a storage escape hatch. Put a source-supported progress deadline in progress.target_at, using an offset-bearing instant when the minute is known or YYYY-MM-DD when only the day is known; do not hide it in label text. Timeline owns histories, itineraries, and undated stages: set order explicitly; keep a complete offset-bearing instant in at when the source establishes one; use date-only at plus time for a source-local itinerary time; omit both only when the sequence is intentionally undated. Never move temporal data into title. A checklist item retains its temporal gate: 'read X before Y' must not become merely 'read X'.",
  "Use a complete set that reduces reader effort, not one component per extracted role or the fewest components at any cost. If an exact-comparison table can carry the recommendation through its semantic highlight and comparison cells, put the concise rationale in answer.verdict rather than repeating the options in a decision. Conversely, do not force unlike roles into a generic component just to reduce the count.",
  "Use facts only for neutral named values. It never substitutes for a recommendation or choice (decision), a finite prerequisite or next gate (checklist), or an owned open loop (status-list). A mixed source may compose metrics, a decision, tasks, and references as siblings in one section; heterogeneity is not a reason to collapse meaning into prose or generic facts.",
  "Spatial position is part of the data. An edit changes the props at an address; it does not renumber the addresses. Keep element ids, collection item ids, child order, and section addresses stable between visits unless the underlying priority truly changed.",
  "The write summary supplies the chrome's what-changed strip. Make it concrete and do not duplicate that delta as body prose.",
  "Only section, grid, carousel and card may have children. Omit children entirely on a leaf; it defaults to an empty array.",
  "section establishes hierarchy and may group mixed full-width content. Use its optional title only for a real page subheading; callout is a brief caveat or rationale, never the page's answer or primary payload.",
  "A multi-day itinerary consulted one day at a time may use one card per day, each holding one ascending timeline, in a carousel; an itinerary read as one continuous plan uses one ascending timeline.",
  `Hard limits, refused at the write edge rather than trimmed: ${MAX_NODES_HARD} elements per page, depth ${MAX_DEPTH} counting root as 1, ${MAX_ITEMS_PER_COLLECTION} items in any one collection prop, ${MAX_BODY_BYTES / 1024} KB per spec, and ${MAX_PATCH_OPS} operations per patch.`,
  `An approval is the short final ask, not the comparison itself. Ask the question once; keep context to what is required to answer; give each option a label of at most ${MAX_CHOICE_LABEL_CHARS} characters and nothing else - what separates the options belongs in context, or in typed page content above the ask. The renderer places the explanation above side-by-side label-only controls. If the person needs a richer comparison, put that source-backed comparison in typed page content and keep the approval's authored fields under ${MAX_APPROVAL_COPY_CHARS} characters total.`,
  "Do not pick the chart's drawing. Say what the labels are with x:{kind} and how the series relate with stack, and leave presentation null; the device draws a line for time, a bar for categories, and an area for a stacked series. Name a presentation only when the data cannot show what you know.",
  "Every explicit chart y_min/y_max must contain every plotted value; an axis that clips an observation is refused. Omit a bound when the source does not justify pinning it.",
  "Never invent quantities, targets, categories, dates, series, axes, or trends to justify a graphic. A graphic earns its place only when it makes an existing comparison, trend, target, or chronology faster to understand.",
  "Use code-block only when exact whitespace or punctuation matters. Use reference-list for supporting evidence. link-button is always prominent and the write edge allows at most one per page; put every supporting destination in reference-list.",
  "Use typed values and ISO dates. Before editing a page, read its current spec and version, then send only the operations that change.",
  "Never author CSS, className, style, HTML, Markdown, JavaScript, state, actions, bindings, directives, visibility, repeat, watch, slots, raw attachment URLs, or decorative empty sections.",
] as const;

/** Source-to-spec example published verbatim in the extended prompt. */
export const MATCHED_AUTHORING_EXAMPLE = {
  answer: {
    verdict: "Four-person trip leaves Sep 12; $720 remains and catering is waiting on Maya.",
  },
  root: "overview",
  elements: {
    overview: {
      type: "section",
      props: {},
      children: ["at-a-glance", "budget", "open-loops"],
    },
    "at-a-glance": {
      type: "grid",
      props: {},
      children: ["trip-date", "travelers"],
    },
    "trip-date": {
      type: "metric",
      props: { label: "Departure", value: "2026-09-12" },
    },
    travelers: {
      type: "metric",
      props: { label: "Travelers", value: 4 },
    },
    budget: {
      type: "progress",
      props: {
        label: "Budget committed",
        current: { amount: 1680, currency: "USD" },
        target: { amount: 2400, currency: "USD" },
      },
    },
    "open-loops": {
      type: "status-list",
      props: {
        items: [
          {
            id: "catering",
            label: "Confirm catering",
            status: "waiting-on-them",
            owner: "Maya",
            since: "2026-08-26",
          },
        ],
      },
    },
  },
} as const;

/**
 * One line per component. The compact prompt states the reader interaction only for blocks with
 * `readerActs`, to save tokens; `full` always states it.
 */
function componentChoices(context: PromptInputs, { full = false }: { full?: boolean } = {}): string[] {
  // PromptContext erases the catalog type; the schema below requires these fields.
  const catalog = context.catalog as SelectionCatalog;
  return [...context.componentNames].sort().map((name) => {
    const component = catalog.components[name];
    const reader = full || component.readerActs === true
      ? ` Reader: ${component.interaction}`
      : "";
    return `- ${name} [${component.shape}]: ${component.description}${reader}`;
  });
}

/** The default prompt: the page contract an agent needs before its first write. */
function displayPrompt(context: PromptInputs): string {
  const componentNames = [...context.componentNames].sort();
  const lines = [
    "STRATA PAGE CONTRACT",
    "",
    "WHEN",
    "Text is the default. Make a page only when the answer holds 3+ structured facts the person will come back to: a comparison, schedule, queue of open loops, ledger, or several peers of one shape. One page per reply. Always also send the one-line text.",
    "",
    "CREATE — PUT /v1/pages with exactly this body:",
    '{"space":{"slug":"trip","name":"2-4 words","emoji":"✈️"},"slug":"page-slug","title":"Title","kind":"living",',
    ' "summary":"what this write changed, one line",',
    ` "spec":{"answer":{"verdict":"where it stands, ≤${MAX_ANSWER_VERDICT_CHARS} chars"},`,
    '         "root":"root",',
    '         "elements":{"root":{"type":"section","props":{},"children":["a","b"]},',
    '                     "a":{"type":"metric","props":{"label":"Remaining","value":{"amount":720,"currency":"USD"}}},',
    '                     "b":{"type":"status-list","props":{"items":[{"id":"catering","label":"Catering","status":"waiting-on-them","owner":"Maya","since":"2026-08-26"}]}}}}}',
    "Rules: ids match ^[a-z][a-z0-9-]{0,63}$ and are defined once; leaves omit children; root is a section with no title; only section, grid, carousel and card have children. kind: living = rewritten as things change, standing = written once.",
    "Response: {page_id, owner_url, url, version, warnings, budget_remaining}. Send the person owner_url with a one-line answer; url is for other recipients.",
    "",
    "EDIT — GET /v1/pages/{id} → {spec, version}; then PATCH /v1/pages/{id}/spec",
    '{"base_version":<version>,"summary":"what changed","ops":[{"op":"replace","path":"/elements/a/props/value","value":640},{"op":"replace","path":"/answer/verdict","value":"…"}]}',
    "Untouched elements keep their ids and order — update in place, never regenerate the page.",
    "",
    "CHOOSE — three steps, in order",
    ...CHOOSE_STEPS,
    "",
    "THREE FIELDS THAT ARE NOT BLOCKS",
    ...CROSS_CUTTING_RULES,
    "",
    `COMPONENTS (${componentNames.length}) — the phrase in brackets is the block's data shape; match step 1's phrase to it, then fetch exact props: GET /v1/manifest?components=metric,status-list (section is included). Blocks are display-only unless a Reader line says otherwise.`,
    ...componentChoices(context),
    "",
    "ORDER",
    "The main answer first; supporting detail after. The summary is the delta the chrome shows — never repeat it in the body.",
    "",
    "LIMITS (a write over a cap is refused, never truncated)",
    `Visible text: living ${PAGE_TEXT_BUDGET.living.toLocaleString("en-US")} chars, standing ${PAGE_TEXT_BUDGET.standing.toLocaleString("en-US")}; one collection ${MAX_COLLECTION_TEXT_CHARS}, and same-type sibling collections under one parent share that single ${MAX_COLLECTION_TEXT_CHARS} - splitting a list into siblings is refused, not a way around it. A plan or log over a cap becomes a parent page plus one page per week or day (sequence up + position), never a line per part.`,
    "Counted: what the reader reads - titles, labels, values, notes, table cells, reference titles and sources. Free: ids, URLs, dates, answer.verdict, code-block code, approval context. Every field's own cap is in its description in GET /v1/manifest. POST /v1/pages/preflight checks the candidate spec and reports budgets without storing it; the final write also checks request metadata and current stored state.",
    "Only facts the source supports: no invented numbers, dates, series, headings, or stronger conclusions. No Markdown or HTML. No styles; URLs only where the schema takes them: link-button, reference-list, and link.",
    "",
    "BEFORE SENDING",
    "Every child id resolves once · every type and prop is in the manifest · every material fact lives in a component, not only in the verdict · every count is under its cap · on a phone, the state is clear in three seconds.",
  ];

  const requestRules = context.options.customRules ?? [];
  if (requestRules.length > 0) {
    lines.push("", "REQUEST-SPECIFIC RULES");
    for (const rule of requestRules) lines.push(`- ${rule}`);
  }

  lines.push(
    "",
    "More depth: GET /v1/guide?topic=representation (representation pass, worked example, display rules).",
  );
  return lines.join("\n");
}

/** The long teaching prompt, served by `GET /v1/guide?topic=representation`. */
export function displayPromptExtended(context: PromptInputs): string {
  const componentNames = [...context.componentNames].sort();
  const lines = [
    context.options.system?.trim() ||
      "You author mobile-first Strata pages through its REST API. The renderer owns browsing, copying and approved reader controls; you supply content, never executable behavior.",
    "A page belongs to one named space, but list_pages is flat. Create a second page for a different cadence, writer, audience, or volume - and a plan or log longer than one screen is volume: one parent page whose item-list links each part, and one page per week or day carrying sequence {up, position}. A text-budget refusal on such a page is the signal to split, never to compress each part to a line. Use sections for presentation hierarchy inside one screen's worth of content.",
    "New pages are always private in their space bundle. Sharing is a separate explicit call. Never re-share a page whose latest exposure_actor is user and shared is false unless the user directly asks.",
    "",
    "AUTHORING OBJECTIVE",
    "Turn source material into a faster answer, not the same text distributed among prettier boxes. Optimize for fewer reading, comparison, and memory operations. Do not optimize for component count or visual variety: one well-chosen status-list can be a better page than five different widgets.",
    "Compression never licenses invention or omission. Preserve material facts, qualifications, uncertainty, sources, and open questions. Remove repetition and connective prose before removing meaning.",
    "",
    "REPRESENTATION PASS — do this before choosing props",
    "1. Write answer.verdict: the shortest faithful answer to 'where do we stand with this?' If a sentence is enough and the answer will not be revisited, send the sentence instead of a page.",
    "2. Extract only source-supported facts into roles: measures; target/progress/deadline; ordered series/trend; exact comparison; chronology/schedule; open loop/owner; recommendation or option/tradeoff; prerequisite or next gate; evidence/resource; action; caveat/explanation.",
    "3. Cluster facts that the reader must understand together. For each cluster, name the cognitive work a component would remove. If it removes none, keep a short sentence or omit the page.",
    "4. Select a complete presentation with the three chooser steps in the display rules below - name each cluster's data shape and take the block with that shape; decide what must stay visible together and pick section, card, grid or carousel accordingly; leave every presentation null unless you know something the data does not say. Compare reading, scrolling, opening and memory effort on a phone rather than minimizing component count. Do not add a component merely because it is available.",
    "5. Run a role-coverage pass. Every material role and qualifier needs a faithful destination in component props; do not hide a deadline, exact event time, measure, prerequisite, or finite action inside answer.verdict, a title, or a reference note merely to use fewer components. Keep every clause whose causal relationship changes a recommendation together in the same prose element. Keep temporal gates such as 'before', 'until', and 'after' in the task or event they qualify. The verdict summarizes the page—it does not replace the typed facts that support it.",
    "6. Reject invention and decorative graphics. Do not add a place name, category, heading, quantity, target, date, series, axis, trend, or stronger conclusion from outside the source, even when it seems obvious. A short typed list is better than a chart that the source did not earn.",
    "7. Fetch exact prop schemas only for the selected set with GET /v1/manifest?components=<comma-separated names>. section is included automatically. Fetch the full manifest only when the representation is genuinely uncertain.",
    "",
    "COMPONENT SELECTION — shape, purpose and actual reader interaction",
    ...componentChoices(context, { full: true }),
    "",
    "CONDITIONAL OUTPUT CONTRACT",
    "If the representation pass says a sentence is enough, do not call the page write API; send that short reply through the host's normal message channel. If a page earns its place, put one canonical JSON Render spec in the API payload. The spec must have exactly this shape:",
    '{"answer":{"verdict":"where this stands, in one line"},"root":"root-id","elements":{"root-id":{"type":"section","props":{},"children":[]}}}',
    "Element ids must match ^[a-z][a-z0-9-]{0,63}$. A child is referenced by id and defined once in elements. Create a page by sending this whole spec to PUT /v1/pages with space_id or space, slug, title, kind, and summary. Edit an existing page with PATCH /v1/pages/{id}/spec: get_page first, then send base_version, summary, and RFC 6902 ops addressing /answer, /root and /elements — {\"op\":\"replace\",\"path\":\"/elements/status/props/value\",\"value\":42}, and {\"op\":\"replace\",\"path\":\"/answer/verdict\",\"value\":\"...\"} when the answer moved. Untouched elements stay as they are; you never resend them. After the write, send the person the one-line answer and returned owner_url.",
    "",
    "MATCHED SOURCE → ROLES → SPEC",
    "Source: \"The four-person trip leaves September 12, 2026. The budget is $2,400 and $1,680 is committed. Catering has been waiting on Maya since August 26, 2026. There is no daily spending history.\"",
    "Roles: answer = trip date, party size, remaining budget, and the one external wait; measures = September 12 and four travelers; target/progress = $1,680 of $2,400; open loop/owner = catering/Maya since August 26; rejected representation = no chart because there is no series. Selected schemas = grid, metric, progress, status-list (plus section).",
    "Complete canonical spec (a leaf omits children):",
    JSON.stringify(
      MATCHED_AUTHORING_EXAMPLE,
      null,
      2,
    ),
    "The spec represents every material trip fact once. The note about absent history governs representation: it does not fabricate daily values just to unlock a chart, and it does not repeat the verdict as prose.",
    "Two shapes from the same trip, for comparison. Quotes that each name a thing and a price are rows with a title and a trailing value, so they are one item-list, and each row that has a quote to read carries its own link:",
    JSON.stringify(ITEM_LIST_LINKS_EXAMPLE),
    "Apartments that each need their own heading and figure are self-contained peers whose numbers should stay side by side, so they are cards in a grid - the card supplies the surface and the metric supplies the value:",
    JSON.stringify(CARD_GRID_EXAMPLE),
    "",
    "DISPLAY RULES",
    ...DISPLAY_AUTHORING_RULES.map((rule) => `- ${rule}`),
    "",
    `CLOSED VOCABULARY (${componentNames.length})`,
    componentNames.join(", "),
    "Exact props, examples, and confusable-component notes live in GET /v1/manifest. Unknown component names or props are refused, not ignored.",
  ];

  const requestRules = context.options.customRules ?? [];
  if (requestRules.length > 0) {
    lines.push("", "REQUEST-SPECIFIC RULES");
    for (const rule of requestRules) lines.push(`- ${rule}`);
  }

  lines.push(
    "",
    "FINAL CHECK",
    "Walk these in order before sending:",
    "1. Walk from root: every child id resolves exactly once, every component and prop is in this catalog, the root is section, and answer.verdict (the TLDR) says where the page stands.",
    "2. Count characters, not elements, and leave room below each cap: if the visible text or any field is at risk of the limit, shorten it before sending.",
    "3. Compare the candidate to the source: every material fact, temporal gate, qualifier, caveat, uncertainty, and source survives in the semantic component that owns it—not only in answer.verdict; causally connected prose stays connected; every label, number, and graphic is source-supported; no conclusion grew stronger during compression.",
    "4. Run the three-second test on a phone: the reader can tell where things stand, what moved from the chrome summary, and what needs them without reading a prose payload.",
    "5. Verify every surviving fact kept the same address.",
  );
  return lines.join("\n");
}

/**
 * JSON Render's flat spec narrowed to Strata's display-only profile. With no runtime fields, the
 * generated prompt and output grammar cannot advertise unsupported capabilities.
 */
export const strataDisplaySchema = defineSchema(
  (s) => ({
    spec: s.object({
      answer: s.object({
        verdict: s.string(),
      }),
      root: s.string(),
      elements: s.record(
        s.object({
          type: s.ref("catalog.components"),
          props: s.propsOf("catalog.components"),
          children: { ...s.array(s.string()), ...s.optional() },
        }),
      ),
    }),
    catalog: s.object({
      components: s.map({
        props: s.zod(),
        slots: { ...s.array(s.string()), ...s.optional() },
        description: s.string(),
        interaction: s.string(),
        shape: s.string(),
        readerActs: { ...s.boolean(), ...s.optional() },
        example: { ...s.any(), ...s.optional() },
      }),
      actions: s.map({
        params: s.zod(),
        description: s.string(),
      }),
    }),
  }),
  { promptTemplate: displayPrompt },
);
