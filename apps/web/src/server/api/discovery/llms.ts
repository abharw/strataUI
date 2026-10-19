/** `GET /llms.txt`: what an agent does once it holds a credential. */
import {
  GUIDE_NODES,
  MAX_ASSET_BYTES,
  MAX_ASSET_CREDIT_CHARS,
  MAX_BODY_BYTES,
  MAX_BREAKDOWN_PARTS,
  MAX_CAROUSEL_CHILDREN,
  MAX_COMPARISON_ITEMS,
  MAX_DEPTH,
  MAX_EMPTY_CHARS,
  MAX_FACTS_ITEMS,
  MAX_GRID_CHILDREN,
  MAX_ITEM_LIST_ITEMS,
  MAX_ITEMS_PER_COLLECTION,
  MAX_NAMESPACE_BYTES,
  MAX_NODES_HARD,
  MAX_PAGE_WRITES_PER_NAMESPACE_PER_DAY,
  MAX_PAGES_PER_NAMESPACE,
  MAX_PHASES_STAGES,
  MAX_SPACES_PER_NAMESPACE,
  UPLOAD_WINDOW_SECONDS,
} from "@/page-content/document/limits";
import {
  CARD_CHILD_TYPES,
  CAROUSEL_CHILD_TYPES,
  GRID_CHILD_TYPES,
} from "@/page-content/document/composition";
import { PAGE_RULES, RENDER_DECISION_RULES } from "@/page-content/authoring/guide";
import { REFRESH_REPLAY_GRACE_SECONDS } from "@/server/credentials/config";
import {
  ANOTHER_ASSISTANT,
  connectLadder,
  DRIVER_SENTENCE,
  staticKeyRule,
} from "./connect-copy";
import { recoveryLines } from "./recovery-copy";
import { CONTRACT_CHANGES, CONTRACT_VERSION } from "@/shared/api/version";

// File caps come from `page-content/document/limits.ts`, never literals, so every document agrees.
const ASSET_MB = MAX_ASSET_BYTES / (1024 * 1024);
const NAMESPACE_MB = MAX_NAMESPACE_BYTES / (1024 * 1024);
const UPLOAD_WINDOW_MINUTES = UPLOAD_WINDOW_SECONDS / 60;

export function llmsText(origin: string): string {
  const ladder = connectLadder(origin);
  const bootstrap = `## Connect first

${ladder.order}

1. ${ladder.held}
2. ${ladder.connect}
   ${ladder.start}
   ${ladder.verify}
   ${ladder.vault}

${DRIVER_SENTENCE}

### Once connected

- Send \`Authorization: Bearer <access_token>\` on every \`/v1\` request.
- Send \`X-Strata-Contract: ${CONTRACT_VERSION}\` — the contract version you learned from this file — on every write (\`PUT\`, \`PATCH\`, \`POST\`, \`DELETE\`). A stale value is refused with \`contract_changed\` before anything is written, and the refusal lists what moved; a missing value is allowed and warned about. Reads never need it.
- Give one credential owner sole authority to refresh. Other workers re-read the current pair from the vault before a request; never race a refresh.
- On \`401\`: \`POST ${origin}/v1/auth/refresh\` \`{"refresh_token":"<refresh_token>"}\` → new \`access_token\` and \`refresh_token\`. Replace both in the vault, then retry the failed request once. If that refresh response is uncertain, re-read the vault first; if it has no newer pair, one retry of the old refresh token within ${String(REFRESH_REPLAY_GRACE_SECONDS)} seconds can recover a lost response only while its direct successor is unspent. Do not repeat it after that.
- On \`400 invalid_grant\` from refresh: this connection cannot recover. It may have been revoked, expired, or replayed; do not claim which. Their Strata and pages still exist. Say so in one sentence and connect again from step 2, which the refusal spells out in its \`recover\` field. Never create a second Strata for a person who had one.
- Never put a token in a page, a URL, or a message. Never construct, guess, or "reconstruct" a share capability URL: page \`url\`s come only from API responses; relay them verbatim or not at all. Authenticated page writes return \`owner_url\`, and page reads return \`meta.owner_url\`, \`meta.url\` and \`meta.shared\` - one page read says where the page stands without listing pages - so use that returned URL when linking the person to their own page.

### Adding another agent, or the person's phone

- ${ANOTHER_ASSISTANT}
- ${staticKeyRule(origin)}
- **The person's phone** is a browser, not an agent: they open \`${origin}/home\` and give the same address and a fresh code. Never mint anything for a phone.

Everything you mint appears under your name at \`${origin}/home\` and can be revoked there on its own. Revoking you does not revoke what you minted.
`;

  return `# Strata

> Strata is a generative workspace that agents create and maintain for a person. A Strata belongs to an email address: an agent asks for that address, the person reads back the code it receives, and the agent holds a namespace-scoped bearer credential from then on. Human read keys are browser capabilities, never API credentials.

This is contract \`${CONTRACT_VERSION}\`. Every response carries \`contract_version\`, and every response also carries it in the \`X-Strata-Contract\` header; if it differs from the one you learned, re-read this file before acting. Send the version you learned back as \`X-Strata-Contract\` on every write, and a change is caught before it costs a page. This file, the authoring guide and the manifest are served with an ETag and \`no-cache\`: re-read with \`If-None-Match\` and an unchanged document costs a 304.

## What changed

Oldest first. A \`contract_changed\` refusal carries the lines you have not seen.

${contractChangeLines()}

${bootstrap}

### Then write

- Read \`GET /v1/guide?topic=authoring\` before authoring. Keep it with the contract version you learned and re-fetch it when that contract changes. Its component chooser is generated from the same catalog as the manifest.
- Fetch \`GET /v1/manifest?components=<comma-separated component names>\` for candidate components to confirm their exact props, supported interactions, and tradeoffs before writing. The required root section is included automatically. Fetch the full manifest only when you need to explore the catalog.
- Then write: \`PUT /v1/pages\` with \`space:{slug,name,emoji}\` creates the first named space and page together. Every page after that one names its space by \`space_id\` - the whole flow is under Spaces below.

## Core model

- A namespace is the person's entire private Strata. One person owns one namespace, and every credential is scoped to it.
- A space is a named membership, sharing, and lifecycle boundary. Give it a 2-4 word navigation label such as "Germany trip"; aim for 30 characters or fewer and put detail on the Page.
- A page is one JSON Render document with its own stable URL, cadence, audience, provenance, and version. Its kind says how it ages: living is rewritten as the situation changes, standing is written once and left in place.
- Agents may start with the flat \`GET /v1/pages\` inventory; the human Home presents Spaces first and recent Pages second.
- New and moved pages are private. \`PATCH /v1/spaces/:id\` with \`{"shared":true}\` snapshots every active Page currently in that Space into one stable shared link. Future Pages stay private. A later \`PATCH /v1/pages/:id\` with \`{"shared":true}\` explicitly adds one. That endpoint is metadata only - editing a page's content is \`PATCH /v1/pages/:id/spec\`, under Authoring rules below.
- Sharing a Page also mints its Space's bundle key, so the first \`PATCH /v1/pages/:id\` with \`{"shared":true}\` is what makes every later \`PATCH /v1/spaces/:id\` answer \`already_shared: true\` and hand back that existing bundle link without snapshotting the Space's other Pages into it.

## Spaces

- The first Page in a Space: \`PUT /v1/pages\` with inline \`space:{slug,name,emoji}\` creates the Space and the Page in one call, and the write response carries the new \`space_id\`.
- Every Page after that: \`PUT /v1/pages\` with \`space_id\`, the uuid from that response or from \`GET /v1/spaces\`. Send \`space_id\` or \`space\`, never both - both together is refused with \`ambiguous_space\`. An inline \`space\` whose slug already exists lands in that same Space and its \`name\` and \`emoji\` are ignored, so what quietly opens a second Space is a changed slug, not a repeated one.
- \`GET /v1/spaces\` lists every Space with its \`space_id\`, \`page_count\`, \`shared_page_count\` and \`shared_bundle\`. \`POST /v1/spaces\` with \`{slug,name,emoji}\` creates an empty one when there is no Page to put in it yet; a Page never falls into a default Space.
- \`PATCH /v1/spaces/:id\` renames a Space (\`name\`, \`emoji\`) and, with \`{"shared":true}\`, snapshots its current active Pages into the one stable \`/share/spk_…\` bundle described above. \`true\` is the only value it takes: nothing an agent calls unshares a Space.

## When to render a page

${renderDecisionLines()}

## Authoring rules

- \`PUT /v1/pages\` creates. Editing is \`PATCH /v1/pages/:id/spec\` with the current \`base_version\` and RFC 6902 operations over \`/answer\`, \`/root\`, \`/elements\`, and \`/sequence\`.
- \`/sequence\` is patched like any other optional object on the spec root: add it whole, replace or remove one arrow or the position, or remove it. The patched page is held to the same schema a whole-spec write is held to, so an arrow that is not a \`{"page"}\` or \`{"url"}\` link, or a \`position\` without a \`{"page"}\` \`up\`, is refused there exactly as it would be in a \`PUT\`.
- \`POST /v1/pages/preflight\` takes \`{kind, spec}\` and checks that candidate against the schema, the text budgets and the spec-only guidance without storing it. It sizes the spec for the \`kind\` you send and no other: a spec that passes at \`standing\` can still be refused at \`living\`, whose page budget is smaller, so preflight at the cadence the page will actually be written with. A write also checks the title, the summary, quota and the page's current version, none of which preflight sees.
- The root element is always a \`section\`, and it carries no \`title\`: the page title is app chrome and repeating it renders it twice.
- Read a page before editing it, then send only the operations that change. Elements the operations do not name are untouched.
- Persist the returned \`page_id\`, \`owner_url\`, and latest \`version\` outside a short-lived task. If a write response is lost, read the page (or list pages after a create) and compare the result before writing again; never blindly resend an old conditional write.
- ${PAGE_RULES.spatialMemory}
- One page answers one question. The chrome carries current state and what changed; order the body for the reader's task.
- ${PAGE_RULES.verdict}
- ${PAGE_RULES.textBudget}
- ${PAGE_RULES.prose}
- Blocks are chosen by data shape, in three steps the authoring guide spells out. Name what the data is in one phrase - one value, named values, rows with a title and a trailing value, records on shared fields, values over shared labels, parts of a whole, an ordered sequence, named stages toward a date - and take the block whose shape is that phrase. Then decide what must stay visible together and pick the container accordingly. Then leave every \`presentation\` null unless you know something the data does not say. Row count and subject matter alone never determine the block, and neither does a picture you had in mind: a line and a bar are one \`chart\`, and a donut is a \`breakdown\` because parts of a whole is different data. That phrase is one string in two documents: the phrase in square brackets on the guide's component line and a component's \`shape\` in the manifest are the same text, so the phrase you named the data with matches on either one.
- ${containerRule()}
- ${crossCuttingFieldsRule()}
- Preserve the source's labels, units, values, and uncertainty. Choose only interactions the live catalog supports; browsing content, copying a value, and saving an answer are different capabilities.
- Do not optimize for component variety. One fitting component can be excellent; several wrappers around sentences are still a text wall. Never invent quantities or a graphic merely to make a page feel visual.
- ${PAGE_RULES.resharing}
- Fetch the scoped manifest for candidate components, for example \`/v1/manifest?components=metric,progress\`. Confirm their props and constraints before writing. The root \`section\` is included automatically. Do not invent components or styling fields.

## Asking the person something

- An \`approval\` element is one short final question. An option is its label. Put whatever separates the options in the one context line above the label-only controls, or in typed page content above the ask. The person taps one from their own Home; nobody else can answer it.
- Nothing calls you back. The answer is on the page: \`GET /v1/pages/:id\` returns \`approvals.open\` (questions still waiting) and \`approvals.answers\` (what came back). \`GET /v1/pages\` carries per-page open and answered counts, and \`GET /v1/decisions\` is the whole namespace's log, a page at a time - newest first, \`limit\` up to 500, and \`next_before\` handed back as \`before\` for the next page - including answers whose page was deleted.
- So the round trip is: write the question, then look again - on your own schedule, when the person next messages you, or when the thing you are blocked on comes due. A reader answer does not change the page's content version, so inspect \`approvals\`, not version alone. Nothing happens if you never look, which is why an approval with a deadline states it once, normally in context.
- An answer is filed against the exact wording. While a question is unanswered you can still fix its words in place. Once it is answered the wording is frozen: writing that element again asks a new question, with its own answer, and the old answer stays in the log with the words it was given for.

## Putting a file on a page

- Two calls. \`POST /v1/assets\` with \`{filename, media_type, size_bytes}\` reserves it and returns an \`asset_id\` beside the \`resource_id\` and \`upload_url\`: write the \`resource_id\` into an \`attachment-list\` item, and pass either id to \`POST /v1/assets/{id}/upload-url\` or \`DELETE /v1/assets/{id}\`. \`PUT\` the raw bytes to that URL. It carries its own signature, so send no token to it, and it works once and expires in ${String(UPLOAD_WINDOW_MINUTES)} minutes.
- \`size_bytes\` is the exact byte length, and it is exact because the namespace's remaining bytes are committed to this file in the same transaction that measures them - that is what makes reserving a set of files and then pushing them safe. Bytes that do not match the declaration are refused. There is no chunked or resumable path: a file capped at ${String(ASSET_MB)} MB is one request.
- If the upload link expires or is lost, \`POST /v1/assets/{id}/upload-url\` mints a fresh one for the same reservation and kills the old one. Reserving the file again instead leaves the first reservation holding quota nobody can use until its window closes.
- The \`PUT\` response says what the bytes turned out to be - \`content_type\`, \`size_bytes\`, \`sha256\`, and \`width\`/\`height\` for an image - and \`GET /v1/assets\` repeats that for every file this Strata holds, beside the limits and the quota. Read it before you reserve if you want the caps first.
- Attribution belongs to the file, not to the page element: put \`credit\` (at most ${String(MAX_ASSET_CREDIT_CHARS)} characters, "Photo by the concierge") and \`source_url\` (an https URL) on the reservation. The credit renders as one quiet caption line and the source as a plain link. Strata never fetches \`source_url\`; it holds bytes you pushed, not bytes it went and got.
- Then put the \`resource_id\` into an \`attachment-list\` item. Never a URL: the page stores the id, and the reader's link is minted fresh on every render and dies in minutes, so a page is not a bearer token for its own files.
- Images render as previews; everything else renders as a file row. An id this namespace does not own resolves to nothing.
- Accepted: PNG, JPEG, WebP, GIF, SVG, PDF, plain text, CSV. One file is capped at ${String(ASSET_MB)} MB and a namespace at ${String(NAMESPACE_MB)} MB, counting files already stored plus reservations that have not expired. \`GET /v1/assets\` reports the usage, and \`DELETE /v1/assets/{id}\` gives one file's bytes back when a page no longer shows it.

## Machine contracts

- [Connection guide](${origin}/auth.md) — how to get a credential in the first place
- [Structured bootstrap metadata](${origin}/.well-known/strata.json)
- [OpenAPI 3.1 description](${origin}/openapi.json)
- [Authoring guide](${origin}/v1/guide?topic=authoring) — requires the namespace token
- [Scoped JSON Render catalog](${origin}/v1/manifest?components=status-list) — requires the namespace token; omit \`components\` for the full catalog

## Human capability URLs

The server returns complete capability URLs. Never assemble them manually:

- Authenticated page reads and writes return \`owner_url\`, the canonical session-backed page for the person. Use it for an approval or a page they should manage themselves.
- \`/share/pgk_…\` exposes one page. The page id is not in the link — the key resolves the page.
- That key is minted when the page is created and sharing does not rotate it, and nothing on that path reads \`shared\`: the \`url\` a create returns opens the page for anyone holding it from the moment it is returned, while the same response still says \`shared: false\`. \`shared\` is consent and bookkeeping - it governs the space bundle, the person's Home, and the re-share rules - not the lock on the link. So treat a returned \`url\` as the secret it is and hand it to the person only when they meant to share; \`shared: false\` is not a promise that the link is dead.
- \`/share/spk_…\` exposes only pages explicitly shared into one space bundle.

## Limits

Request bodies are capped at ${String(MAX_BODY_BYTES / 1024)} KB. A namespace may hold ${String(MAX_SPACES_PER_NAMESPACE)} spaces, ${String(MAX_PAGES_PER_NAMESPACE)} pages, ${String(NAMESPACE_MB)} MB of files, and ${MAX_PAGE_WRITES_PER_NAMESPACE_PER_DAY.toLocaleString("en-US")} page writes per UTC day. Aim for at most ${String(GUIDE_NODES)} elements per page; the hard limit is ${String(MAX_NODES_HARD)}, at a depth of ${String(MAX_DEPTH)} counting the root as 1.

Containers and collections have their own ceilings, refused at the write edge like every other cap: a \`grid\` holds ${String(MAX_GRID_CHILDREN)} children and a \`carousel\` ${String(MAX_CAROUSEL_CHILDREN)} cards; \`item-list\` takes ${String(MAX_ITEM_LIST_ITEMS)} rows, \`facts\` ${String(MAX_FACTS_ITEMS)} items, \`comparison\` ${String(MAX_COMPARISON_ITEMS)} rows, \`breakdown\` ${String(MAX_BREAKDOWN_PARTS)} parts and \`phases\` ${String(MAX_PHASES_STAGES)} stages. Every other collection prop caps at ${MAX_ITEMS_PER_COLLECTION.toLocaleString("en-US")} items. The manifest carries each block's exact field caps; the text budgets above bind first and usually bind long before any of these.

## If something fails

Every 4xx and 5xx body carries \`error\` (what happened), \`code\` (the stable handle below), \`next\` (operation ids), and — where there is one call that fixes it — a \`recover\` block holding the whole call as a complete URL. Read \`recover\` before you improvise: it is written for the case where you can no longer fetch anything to look one up.

${recoveryLines("llms", origin)}

## Known gaps in v1

Say these plainly if the person asks; do not design around them silently.

- Unsharing a page removes it from its space bundle, but a \`/share/pgk_…\` link already handed out keeps working: the page key is its own capability, and nothing an agent can call replaces it. If the person says "take that back", say that the old link still opens the page and that they can retire it from Home.
- A page's link preview (\`/share/:key/og/image\`) renders the page title, so a chat app unfurling a shared link shows what it opens. It takes the same key the link does — a page id alone reveals nothing — so the preview is visible to whoever already holds the link, and to nobody else. Rotating the key retires the preview with it.
`;
}

/** The render decision as bullets; the guide renders the same rules. */
function renderDecisionLines(): string {
  return RENDER_DECISION_RULES.map((rule) => `- ${rule}`).join("\n");
}

/** Container rules, rendered from the allow-lists in `document/composition.ts`. */
function containerRule(): string {
  return `Only \`section\`, \`card\`, \`grid\` and \`carousel\` take children. \`section\` is the default and the root is always one, untitled. \`card\` is a container with slots rather than a type - a stat card is \`card\` + \`metric\`, a cover card is \`card\` with media, a list card is \`card\` + \`item-list\` - and it holds ${CARD_CHILD_TYPES.join(", ")} and no container at all. \`grid\` keeps up to ${String(MAX_GRID_CHILDREN)} compact peers visible together in two phone columns and holds ${GRID_CHILD_TYPES.join(", ")}. \`carousel\` browses up to ${String(MAX_CAROUSEL_CHILDREN)} peers one at a time and holds ${CAROUSEL_CHILD_TYPES.join(", ")} only.`;
}

/**
 * The fields that recur across blocks (`link`, `empty`, `sequence`), ending with the rule for
 * which readers cross-page references resolve for.
 */
function crossCuttingFieldsRule(): string {
  return `Three fields recur across blocks instead of being blocks. \`link\` makes a whole \`card\`, an \`item-list\` row, a \`timeline\` event or a \`checklist\` step's label tappable, and is exactly one of \`{"page": "<a page id>"}\` or \`{"url": "https://…"}\` - never a share URL you assembled. \`empty\` is one sentence of at most ${String(MAX_EMPTY_CHARS)} characters shown in place of a collection with no items; an items array may be empty only when \`empty\` is set, which is what makes "No workouts logged yet" possible instead of an invented row. \`sequence\` sits on the spec root - \`{"up","position"}\` or \`{"previous","next","up"}\`, each arrow a link - and the chrome renders it under the title as the page's pager, so a Week page belongs to its Plan without a navigation block in the body. With \`up\` and a \`position\`, \`previous\` and \`next\` are derived at read time from the siblings that share that \`up\`, so a plan's pages are written in one pass; it is edited through \`PATCH /v1/pages/:id/spec\` like the rest of the spec. Cross-page links and \`sequence\` entries resolve for the owner, and for a Space share link when the target page is currently shared in that same Space; a page share link resolves nothing beyond its own page, so write cross-page references expecting them to render as plain text there.`;
}

function contractChangeLines(): string {
  return CONTRACT_CHANGES.map((change) => `- \`${change.version}\` — ${change.note}`).join("\n");
}
