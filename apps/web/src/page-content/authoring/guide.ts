/**
 * Authoring guide topics, derived from the catalog that validates and renders documents. The
 * upstream JSON Render prompt is not used because it teaches features this profile forbids.
 */
import {
  ALLOWED_MEDIA_TYPES,
  MAX_ANSWER_VERDICT_CHARS,
  MAX_ASSET_BYTES,
  MAX_ASSET_CREDIT_CHARS,
  MAX_CAROUSEL_CHILDREN,
  MAX_COLLECTION_TEXT_CHARS,
  MAX_GRID_CHILDREN,
  MAX_NAMESPACE_BYTES,
  MAX_PROSE_CHARS,
  MAX_WRITE_ASSET_REFS,
  PAGE_TEXT_BUDGET,
  UPLOAD_WINDOW_SECONDS,
} from "@/page-content/document/limits";
import { CARD_CHILD_TYPES, GRID_CHILD_TYPES } from "@/page-content/document/composition";
import { fieldBudgetSentence } from "@/page-content/authoring/field-budget";
import { generateManifest } from "@/page-content/authoring/manifest";
import { strataCatalog } from "@/page-content/json-render/catalog";
import {
  CARD_GRID_EXAMPLE,
  DISPLAY_AUTHORING_RULES,
  displayPromptExtended,
  ITEM_LIST_LINKS_EXAMPLE,
  promptInputs,
} from "@/page-content/authoring/prompt";

/** Read once at module load so the derived guide text is not rebuilt per request. */
const MANIFEST = generateManifest();

export const GUIDE_TOPICS = [
  "authoring",
  "representation",
  "render-policy",
  "vocabulary",
  "examples",
  "quality",
] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const RENDER_POLICY = `Strata renders semantic JSON through JSON Render ${
  MANIFEST.json_render_version
}. Instinct writes the canonical {answer,root,elements} JSON Render spec directly through REST. Each element is {type,props,children}; children is optional and defaults to [], so a leaf can omit it. The same spec is validated, stored, and rendered without a second document grammar; direct owner pages poll it live, while v1 shared links refresh on reload.

Composition rules:
${DISPLAY_AUTHORING_RULES.map((rule) => `- ${rule}`).join("\n")}`;

/** When a page beats a sentence. Shared with `discovery/llms.ts`. */
export const RENDER_DECISION_RULES: readonly string[] = [
  "Text is the default. A page is for an answer that keeps mattering.",
  "Render a page when the answer carries three or more structured facts that gain from typed layout: a comparison, a schedule, a queue of open loops, a ledger, several peers of the same shape. Render it when the reader will come back to the same question and expects the facts in the same place.",
  "Do not render when a sentence does the job. A paragraph wrapped in a card is worse than the paragraph. One page per reply, never two. A page read once and never revisited is a message with extra steps.",
  "Every page ships with the one-line text it would have been anyway. The link never replaces the sentence.",
];

const RENDER_DECISION = `WHEN TO RENDER A PAGE, NOT A TEXT REPLY

${RENDER_DECISION_RULES.join("\n\n")}`;

/** Page rules rendered by both the guide and `/llms.txt`, so the two cannot disagree. */
export const PAGE_RULES = {
  verdict:
    `Every spec carries \`answer:{verdict}\` beside \`root\` and \`elements\`. The verdict is the page's TLDR: its standing state in at most ${MAX_ANSWER_VERDICT_CHARS} characters - what the page says when nothing has changed - as opposed to the write summary, which is this write's delta and feeds the chrome's what-changed strip. A spec without one is refused. When the answer captures information from a specific day, say so in the text ("Prices as of Aug 28: …"); the chrome already shows when the page was last written.`,
  textBudget:
    `${fieldBudgetSentence("guide")} Other component fields carry their own manifest-visible caps. code-block code and approval context are exempt only from the page-wide budget; their own caps still apply. The refusal names the cap, the count, and the overage: the fix is to compress, to move the detail to a second page, or to drop it - never to truncate mid-sentence, and never to shatter one list into several sibling collections to dodge its cap. What counts is what the reader reads: titles, labels, values, notes, table headers and cells, reference titles and sources. Machinery is free: ids, URLs, dates and timestamps (published_at included), enum values, a card's emoji, answer.verdict, code-block code, and approval context. Every write response reports text_chars and budget_remaining. POST /v1/pages/preflight checks a candidate's spec schema, text budgets, and spec-only guidance without storing it; it does not validate the later request's title or summary, reserve quotas, or check the target page's current version, so a successful preflight does not guarantee the write will succeed.`,
  prose:
    `prose is the one sustained passage a page may hold: at most ${MAX_PROSE_CHARS} characters, one element per page, and never the root's first child. The first viewport is the answer, not a paragraph about it - a page that opens with a paragraph has already failed the three-second test.`,
  spatialMemory:
    "Element and collection-item ids are the reader's spatial memory. Facts keep the same element id, collection-item id, child order, and section address between visits unless their real priority changed: an edit changes what is at an address, it does not renumber the addresses. Update in place; do not regenerate the page around unchanged facts.",
  resharing:
    "Never re-share a page the user unshared - shared:false with exposure_actor:user - unless the user directly asks. Moving a page always resets it private; explicitly re-share afterward only when authorized.",
} as const;


const ONTOLOGY = `Ontology and lifecycle:
- list_pages is the default orientation call. It returns one flat list and includes space_id, space_slug, space_name, and space_emoji on every page. Filter by space_id only when useful; never require a list-spaces round trip first.
- A page is one JSON Render document answering one question: "where do we stand with this?" Its kind says how it ages: living is rewritten as the situation changes, standing is written once and left in place. Create a page only when stable position, state, or typed compression beats a short message.
- ${PAGE_RULES.verdict}
- Put the representation that answers the reader's main question first, whether a chart, timeline, comparison, or focused peer. Keep information visible together when comparison matters; use browsing when inspecting one item matters more. The write summary becomes the chrome's delta strip; never duplicate it as body prose. Supporting detail follows.
- ${PAGE_RULES.textBudget}
- ${PAGE_RULES.prose}
- ${PAGE_RULES.spatialMemory}
- put_page creates a page. Editing one is PATCH /v1/pages/{id}/spec: call get_page for the current spec and version, then send base_version, summary, and RFC 6902 operations over /answer, /root and /elements. Elements you do not name are untouched, so an id survives unless you remove it. Persist the returned page_id, owner_url and version outside short-lived work. If a write response is lost, read the page (or list pages after a create) and compare it before another write; never blindly replay an old conditional request. When the situation moves, the verdict moves with it: {"op":"replace","path":"/answer/verdict","value":"..."} is an ordinary part of that patch.
- Presence is a claim you make, not a side effect of writing. A write is assumed finished; pass presence:"open" only while more writes are coming in the same sequence, and the page tells its reader an agent is working on it for the next two minutes, renewed by each write. Send nothing, or presence:"done", and the page stops claiming activity the moment you stop.
- A page someone is watching you work on can show its write trail: pass live_steps:true on the write that starts the run (or flip it with set_page), and the page's chrome grows a collapsible "View steps" section - every write's summary, newest first, with the version it made. It is off by default and stays off on every page that never asked; GET /v1/pages/{id}/summary says where the switch stands. A write may attach evidence to its own step with asset_refs: up to ${MAX_WRITE_ASSET_REFS} resource_ids from reserve_asset (a screenshot of what you just did), rendered inline beside that summary. That is the trail's file, not the page's: a file the page itself should show still goes in an attachment-list.
- Deletion is explicit: a remove operation names the element it drops. Replace a changed subtree in one operation rather than rebuilding the document node by node; a patch carries at most 200 operations.
- Create another page when cadence, writer identity, audience, or volume diverges - and a plan, programme or log longer than one phone screen is volume. Its shape is one parent page (the phases, the facts, and an item-list whose rows link each part) plus one page per week or day, each carrying sequence {"up": {"page": <parent id>}, "position": <n>}. The chrome draws the previous and next arrows from the siblings, so the reader steps through the plan a screen at a time. A text-budget refusal on a plan is the signal to split it, never to compress each week to a line. Do not split one screen's worth of content merely to achieve a layout.
- A space is a folder-like collection of pages. Its name is a 2-4 word navigation label, such as "Germany trip" or "Apartment hunt"; aim for 30 characters or fewer and put qualifiers or sentences on the Page. Every inline space reference is space:{slug,name,emoji}, where emoji is exactly one meaningful Unicode emoji grapheme. It creates the Space when the slug is new; if the slug already exists, its stored emoji remains authoritative. Use space_id when you only need to reference an existing Space. create_space also requires slug, name, and emoji; set_space changes emoji only when that is deliberate.
- A page's title is metadata: set_page takes title on its own, so fixing a wrong name costs no content write and does not change the version. A spec write may carry title too, for a rebuild that renames as it replaces the body.
- Membership and exposure are separate. Every new or moved page is shared:false. Sharing a Space with set_space {"shared":true} includes every page that exists at that moment and returns one stable space_url. Pages created later stay private.
- Calling set_space {"shared":true} again returns the same stable space_url without adding later pages. Add one of those pages explicitly with set_page {"shared":true}; remove one with set_page {"shared":false}.
- ${PAGE_RULES.resharing}
- Deleting a Page or a Space is permanent and stops its links opening, so delete_page and delete_space both take an explicit confirmation and only when the person asked. There is no archive: a Page you no longer maintain is either deleted or left alone. Do not replace or discard a stable page URL.
- When you link the person to their own page, use the owner_url returned by an authenticated page read or write. That surface marks the page seen, keeps cross-page links live, and is where pinning, deleting and approvals happen, and it opens for the browser the person signed in on. The url capability is what you hand to anyone else. Cross-page links and sequence entries resolve for the owner, and for a Space share link when the target page is currently shared in that same Space; a page share link resolves nothing beyond its own page, so write cross-page references expecting them to render as plain text there.
- Strata has no directory, so nothing but the namespace's display name knows what to call the person. A shared page uses it to say who an open question is waiting on; without it the badge just reads Open.
- A file a page shows is two calls, and the page never holds a URL. reserve_asset (POST /v1/assets) with {filename, media_type, size_bytes} returns a resource_id and one upload_url; PUT the raw bytes there with no token, because the signature in that URL is the capability. Then name the resource_id in an attachment-list item. size_bytes is the exact byte length: the namespace's remaining bytes are committed to this file in the same transaction that measures them, which is what makes reserving a set of files and then pushing them safe, and why there is no chunked or resumable upload - one file is one request, and a length that does not match the bytes is refused.
- The upload URL works once and lives ${String(UPLOAD_WINDOW_SECONDS / 60)} minutes. If it expires or is lost, reissue_upload_url (POST /v1/assets/{id}/upload-url) mints a fresh one for the same reservation and kills the old one; reserving the file again instead leaves the first reservation holding quota nobody can use.
- Attribution belongs to the file, not to the attachment-list item: put credit (at most ${MAX_ASSET_CREDIT_CHARS} characters, such as "Photo by the concierge") and source_url (an https URL) on the reservation, and every page that names the file renders the credit as one quiet caption and the source as a plain link. source_url is displayed and never fetched - Strata holds bytes you pushed, not bytes it went and got.
- list_assets (GET /v1/assets) is the limits and the inventory in one call: ${ALLOWED_MEDIA_TYPES.join(", ")}, ${String(MAX_ASSET_BYTES / (1024 * 1024))} MB per file, ${String(MAX_NAMESPACE_BYTES / (1024 * 1024))} MB per Strata counting live reservations, plus every file held with the digest, the image dimensions and the id delete_asset takes. Read it before you reserve and no reservation is spent discovering a cap. The push response carries the same facts for the file that just landed.
- An approval element asks the person one short final question. An option is its label. Keep the one explanation the reader needs above succinct label-only controls, and put whatever separates the options in that context line or in typed page content above the ask; never repeat the same fact in question and context. If choosing requires a richer comparison, represent that comparison once in typed page content and leave the approval as the final ask. Nothing calls you back: the answer is on the page. GET /v1/pages/:id returns approvals.open for what is still waiting and approvals.answers for what came back, GET /v1/pages carries per-page counts, and GET /v1/decisions is every answer in the namespace. An answer does not move the content version, so a pending approval check reads approvals rather than version alone. Write the question, then look again on your own schedule - an approval with a deadline states it once, normally in context, because nothing is watching for you. While a question is unanswered you may fix its wording in place; once it is answered the wording is frozen and writing that element again asks a new question rather than editing the answered one.`;

// Manifest order, so the guide and GET /v1/manifest list components identically.
const VOCABULARY = MANIFEST.components
  .map((component) => {
    const confusion = component.confusable_with.length === 0
      ? ""
      : `\n  Distinguish: ${component.confusable_with.map((pair) => pair.note).join(" ")}`;
    const slots = component.slots.length === 0
      ? ""
      : `\n  Slots: ${JSON.stringify(component.slots)}; use children for the default slot.`;
    return `- ${component.name}: ${component.description} Reader: ${component.interaction}${confusion}${slots}\n  Props schema: ${JSON.stringify(component.props)}`;
  })
  .join("\n");

const EXAMPLE_PROPS = Object.fromEntries(
  MANIFEST.components.map((component) => [component.name, component.example]),
);

const EXAMPLES = `Representation examples — the same data can support different reader tasks:
- Compare values over shared labels: chart keeps the shape visible; its data disclosure supplies exact values. Leave presentation null and say what the labels are with x:{kind}. Do not hide every observation in a separate swipe when the reader must compare them.
- See how one whole splits: breakdown, not a chart. Composition is different data from change across labels, which is why it is a different block rather than a different drawing.
- Scan things that each carry one number: item-list. A row is a title, an optional supporting line and a trailing value, with an optional thumbnail, date and link. Reach for table only when the reader compares several shared fields per record.
- Inspect one peer at a time: carousel of cards. Keep a comparison in a grid or a section when simultaneous visibility matters more than focused inspection.
- Look up exact values across records and fields: table keeps row/column relationships visible. One record's named values are facts; a two-column table is usually an item-list; row count alone cannot decide the task.
- Show what changed on a few named rows: comparison stacks a before and an after per row, which is what stops a three-column table scrolling off a phone.
- Follow what happens next: timeline preserves the source's sequence and time precision; phases names the stretches of a plan and lets the device work out which one is current. Add progress only if the source supplies a meaningful target, and a checklist only for actual prerequisites or tasks; do not invent them to complete a layout.
- Choose among alternatives: decision displays the recommendation and tradeoffs; approval records a reader's answer. Use only the controls the component offers, and do not duplicate an exact comparison that already carries the choice.

These are conditional examples, not required page recipes. Preserve material facts and stable ids across updates.

Minimal canonical JSON Render spec (state, not prose):
${JSON.stringify({
    answer: { verdict: "One loop open: registration is waiting on you." },
    root: "overview",
    elements: {
      overview: {
        type: "section",
        props: {},
        children: ["open-loops"],
      },
      "open-loops": {
        type: "status-list",
        props: {
          items: [{
            id: "registration",
            label: "Complete registration",
            status: "waiting-on-you",
            since: "2026-08-22",
          }],
        },
        children: [],
      },
    },
  }, null, 2)}

Rows that each carry one number and lead somewhere are one item-list, not a table and not five cards:
${JSON.stringify(ITEM_LIST_LINKS_EXAMPLE, null, 2)}

Peers that each need their own heading and figure, held side by side, are cards in a grid — the card supplies the surface, one child block supplies the content:
${JSON.stringify(CARD_GRID_EXAMPLE, null, 2)}

Minimal valid props for each component:
${JSON.stringify(EXAMPLE_PROPS, null, 2)}`;

const QUALITY = `Before writing:
1. Three-second phone test: without reading a prose payload, the reader knows the state now, sees what moved in the chrome summary, and knows what needs them.
2. The first viewport supports the current answer with the representation that serves the reader's task. Comparison keeps peers visible together; browsing focuses on one item. A chart, timeline, or focused peer can lead without a metric prepended. Supporting detail comes later.
2a. State the answer in \`answer.verdict\` first, in one line of at most ${MAX_ANSWER_VERDICT_CHARS} characters. If you cannot, the page is either two pages or a message.
2b. Count characters before sending: ${PAGE_TEXT_BUDGET.living.toLocaleString("en-US")} of visible text on a living page, ${PAGE_TEXT_BUDGET.standing.toLocaleString("en-US")} on a standing one, ${MAX_COLLECTION_TEXT_CHARS} across any one collection, and the per-field caps in the render policy. These are refusals, not advice. Compress, split across pages, or drop - one list stays one collection, and the page that needs the room is the page that should not have it. POST /v1/pages/preflight checks the candidate spec and reports budgets without storing anything; a final write also checks request metadata and current stored state.
3. Stable-address test: read the current page first. Every surviving fact keeps its element id, collection-item id, relative child order, and section position unless its real priority changed.
4. The summary names the concrete delta that chrome will show; the body does not repeat it. Callout is only a short caveat or rationale.
5. The root is section; only section/grid/carousel/card own children, and a leaf may omit the field. Grid holds up to ${MAX_GRID_CHILDREN} compact peers (${GRID_CHILD_TYPES.join(", ")}); carousel holds up to ${MAX_CAROUSEL_CHILDREN} cards; a card holds ${CARD_CHILD_TYPES.join(", ")} and no container at all.
5a. Every presentation you named is one the data could not imply. Null is the answer whenever the device can see what you saw: the labels, the number of parts, the length of a value, the count of columns.
6. No duplicated chrome, headings, buttons over charts, horizontal page overflow, or empty decoration.
7. Charts have 1-5 uniquely named series, one value per label, and honest axes - a bar chart's axis starts at 0 because bar length encodes value, and every explicit y_min/y_max contains all plotted observations. Tables have one cell per column and valid column indices.
7a. The conditional requirements: progress targets are never 0; a settled decision carries its rationale; a status-list item waiting on someone names that person or org in owner; since, timeline at and reference published_at take whatever precision the source establishes - the offset-bearing datetime when you know the minute (since renders '6 days ago'), the bare day when that is all you know (renders 'since Tue, Aug 18'), a year-month or a bare year when the source only fixes the month or the year - never invent precision to get a finer-grained form, and note that a deadline (due_at, next_check_at) is a date someone set, so it stays an exact day or instant; a collection ships empty only with the \`empty\` sentence that says why, and never carries \`empty\` beside real items - "No workouts logged yet" is an answer, an invented row is not, and \`phases\` takes neither because its stages are required; element and item ids are unique within their scope; the root section never ships with zero children - when the page's last loop closes, replace its children with whatever now carries the state (a decision, a callout note) instead of leaving it empty. If a stored item breaks a newer rule (a waiting-on-them with no owner), every later patch refuses until it is repaired - fix the inherited item in the same write.
8. All copyable/reference data is typed. Attachment resource ids came from the host. Code blocks contain exact text without Markdown fences.
9. Every component and prop appears in the current scoped manifest. No model-authored styles, no URLs outside the fields whose schema takes them (link-button, reference-list, and a link on a card, item-list row, timeline event or checklist step), no dynamic directives, state, or executable behavior.
10. The write edge refuses objective presentation failures before persistence: recognized Markdown or HTML markers that would render literally, a summary copied into narrative body text, and more than one quote. Repair the named path and retry the same operation. A one-row table and repeated-component observations are advisory: compare the suggested alternatives against the reader's task, and keep a fitting representation. Coherent carousel peers may repeat.`;

const GUIDE: Record<GuideTopic, () => string> = {
  authoring: () => strataCatalog.prompt(),
  representation: () => displayPromptExtended(promptInputs(strataCatalog.data)),
  "render-policy": () => `${RENDER_DECISION}\n\n${ONTOLOGY}\n\n${RENDER_POLICY}`,
  vocabulary: () => VOCABULARY,
  examples: () => EXAMPLES,
  quality: () => QUALITY,
};

export function guideText(topic: GuideTopic): string {
  return GUIDE[topic]();
}
