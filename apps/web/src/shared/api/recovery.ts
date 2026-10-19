/**
 * Single source for agent-facing error recovery: `fail()` attaches it to every error body and the
 * discovery docs render from it, so the two cannot drift. Each code has a flat `truth`, a literal
 * `recover` call (`null` means fix and resend), and an optional `avoid`. Paths are relative.
 */

interface RecoveryCall {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** An OpenAPI path, relative. The response layer prefixes the origin. */
  path: string;
  body?: Record<string, unknown>;
  /** What to do with the response, in one line. */
  then: string;
}

/** Which agent-facing document renders this entry. */
export type RecoverySurface = "llms" | "auth";

export interface Recovery {
  /** One sentence of fact. */
  truth: string;
  /** The literal next call, or `null` when the fix is to resend this one. */
  recover: RecoveryCall | null;
  /** The wrong move this failure invites. */
  avoid?: string;
  /** The discovery documents that render this entry. */
  docs?: readonly RecoverySurface[];
}

/* ------------------------------------------------------------ the calls */

const START_AUTH: RecoveryCall = {
  method: "POST",
  path: "/v1/auth/start",
  body: { email: "<the person's email>", driver: "<your driver>", label: "<your name>" },
  then: "ask the person for the code the email carries, then POST /v1/auth/verify with the same email",
};

const REFRESH: RecoveryCall = {
  method: "POST",
  path: "/v1/auth/refresh",
  body: { refresh_token: "<your sr_ refresh token>" },
  then: "replace both tokens in your vault, then retry the failed request once",
};

const LIST_PAGES: RecoveryCall = {
  method: "GET",
  path: "/v1/pages",
  then: "find the page in the inventory and use the id the response gives",
};

const LIST_SPACES: RecoveryCall = {
  method: "GET",
  path: "/v1/spaces",
  then: "use a space_id from the response, or create the Space you meant",
};

const READ_PAGE: RecoveryCall = {
  method: "GET",
  path: "/v1/pages/{id}",
  then: "rebuild the write against the spec and version the response returns",
};

const READ_GUIDE: RecoveryCall = {
  method: "GET",
  path: "/v1/guide",
  then: "re-read the page contract, then send this request again with only the fields it documents",
};

const RELEARN_CONTRACT: RecoveryCall = {
  method: "GET",
  path: "/v1/guide",
  then:
    "with topic=authoring, after re-reading /llms.txt: then fetch the manifest for the components this request uses, rebuild the request under the current contract, and resend it with the new version in X-Strata-Contract",
};

const READ_MANIFEST: RecoveryCall = {
  method: "GET",
  path: "/v1/manifest",
  then: "fetch the schemas for the components this page actually uses, repair the spec, and write again",
};

/* ----------------------------------------------------------- the table */

export const RECOVERY = {
  /* ---- connection -------------------------------------------------- */

  unauthenticated: {
    truth:
      "Strata does not accept this credential, and does not say whether it expired or was revoked. The person's Strata and every page in it are untouched: the credential died, the workspace did not.",
    recover: REFRESH,
    avoid:
      "Do not tell the person their Strata is broken, and do not create a second one. If refresh answers invalid_grant, the connection is over, not the Strata.",
    docs: ["llms", "auth"],
  },
  wrong_credential_kind: {
    truth:
      "A browser capability key (pgk_, spk_) arrived in the Authorization header. Those open a page or a shared Space in a browser; they are not API credentials and never become one.",
    recover: START_AUTH,
    avoid: "Do not send anything that came out of a URL as a bearer token.",
    docs: ["llms"],
  },
  invalid_grant: {
    truth:
      "This refresh token cannot recover the connection. The person's Strata and every page in it still exist and are unchanged: reconnecting is the only way back for this agent.",
    recover: START_AUTH,
    avoid:
      "Do not retry the refresh, and never open a second Strata for a person who already has one — verifying their email again reaches the one they have.",
    docs: ["llms", "auth"],
  },
  insufficient_scope: {
    truth:
      "This credential does not carry what this route needs. A grant holds exactly the kind and scopes it was minted with, and a viewer is read-only for the whole life of its grant.",
    recover: START_AUTH,
    avoid:
      "Do not retry the same call, and do not look for a scope parameter to widen — there is none.",
    docs: ["llms", "auth"],
  },
  namespace_gone: {
    truth:
      "The namespace this credential names has been deleted, and a credential dies with its namespace.",
    recover: START_AUTH,
    avoid: "Do not refresh this credential; there is nothing left for it to name.",
  },
  invalid_code: {
    truth:
      "That code is not usable. Strata answers identically for a wrong code, an expired one and a spent one, so this says nothing about which.",
    recover: START_AUTH,
    avoid:
      "Do not retry the code, do not try a variation of it, and do not ask the person to read it out again — ask for a fresh one.",
    docs: ["llms", "auth"],
  },
  invalid_email: {
    truth:
      "Mail cannot be delivered to that address, so no code is coming. It says nothing about whether the person has a Strata; nothing was looked up.",
    recover: START_AUTH,
    avoid:
      "Do not resend the same address, and do not guess a correction to it — ask the person for one they read mail at.",
  },
  invalid_driver: {
    truth:
      "`driver` names the agent product holding the credential and must be one of the values in `valid`; send this request again with one of them.",
    recover: null,
    avoid: "Do not invent a driver name; send `other` when yours is not listed.",
    docs: ["auth"],
  },
  rate_limited: {
    truth:
      "A budget on this resource is spent; `resource`, `limit` and `retry_after_seconds` say which one and for how long. Wait that long and send the same request again.",
    recover: null,
    avoid:
      "Do not retry before retry_after_seconds, and do not switch endpoints, keys, or sources to get around it.",
    docs: ["llms", "auth"],
  },

  /* ---- request shape ------------------------------------------------ */

  invalid_json: {
    truth:
      "The body was not JSON, even after a repair pass that strips a code fence and trailing commas.",
    recover: null,
    avoid: "Do not wrap the body in ```json, quotes, or any surrounding prose.",
  },
  invalid_request: {
    truth:
      "The body parsed but does not match this endpoint's schema; `path` names the first field and `errors` carries the rest.",
    recover: READ_GUIDE,
    avoid:
      "Do not resend the same body, and do not add fields the schema does not list — this endpoint ignores nothing.",
    docs: ["llms"],
  },
  unknown_parameter: {
    truth:
      "That query parameter does not exist on this endpoint; `valid` is the complete set it reads.",
    recover: null,
    avoid: "Do not assume an unrecognised parameter is ignored — a filter that did nothing is a wrong answer that looks right.",
  },
  unknown_topic: {
    truth: "`/v1/guide` has no topic by that name; `valid` lists every one it has.",
    recover: { method: "GET", path: "/v1/guide", then: "read the authoring topic, which is the whole page contract" },
    avoid: "Do not guess a second topic name.",
  },
  invalid_page_ids: {
    truth: "The Space selection contains a value that is not a Page UUID.",
    recover: LIST_PAGES,
    avoid: "Do not construct or repair Page ids; use the current inventory.",
  },
  too_many_page_ids: {
    truth: "The Space selection contains more Page ids than the limit named in the error.",
    recover: LIST_PAGES,
    avoid: "Do not split one selection across several requests because each request replaces the complete included set.",
  },
  duplicate_page_ids: {
    truth: "The Space selection names the same Page more than once.",
    recover: LIST_PAGES,
    avoid: "Do not treat repeated ids as ordering or weighting; include each chosen Page once.",
  },
  body_too_large: {
    truth: "The request body is over the 256 KB cap, which is checked before anything parses it.",
    recover: null,
    avoid:
      "Do not split one page into two to fit; split only when the content has its own cadence, writer, audience, or volume boundary.",
  },
  asset_too_large: {
    truth: "That file is over the per-asset byte limit named in the message.",
    recover: null,
    avoid: "Do not retry the upload unchanged, and do not chunk one file across several assets.",
  },
  internal_error: {
    truth: "Strata failed to handle the request. Nothing was written, so retrying is safe.",
    recover: null,
    avoid: "Do not rewrite the page from scratch on the assumption that a partial write landed; there is no partial write.",
  },

  /* ---- addressing --------------------------------------------------- */

  not_found: {
    truth: "Nothing in this Strata answers to that address.",
    recover: LIST_PAGES,
    avoid: "Do not retry the id, and do not construct another one.",
    docs: ["llms"],
  },
  page_not_found: {
    truth:
      "There is no page with this id in your Strata — the one namespace this credential names. The id may be stale rather than wrong.",
    recover: LIST_PAGES,
    avoid: "Do not create a replacement page before reading the inventory.",
    docs: ["llms"],
  },
  space_not_found: {
    truth: "There is no Space with that id in this Strata.",
    recover: LIST_SPACES,
    avoid: "Do not fall back to a default Space; pages never land in one.",
  },
  page_moved: {
    truth: "The page changed Space while this request was acquiring its lifecycle locks.",
    recover: READ_PAGE,
    avoid: "Do not retry the identical request; it will race the same way.",
  },
  space_required: {
    truth:
      "Creating a page needs `space_id` or `space {slug,name,emoji}`. There is no generic default Space for pages to fall into.",
    recover: LIST_SPACES,
    avoid: "Do not invent a Space named General; name the one this page belongs in.",
  },
  ambiguous_space: {
    truth: "This request names a Space twice, with `space_id` and with `space`.",
    recover: null,
    avoid: "Do not send both and expect one to win.",
  },
  space_not_empty: {
    truth: "That Space still holds pages, and deleting it would erase them.",
    recover: LIST_PAGES,
    avoid: "Do not send with_pages=true to get past this unless the person asked for permanent erasure.",
  },
  space_link_not_recoverable: {
    truth:
      "This Space's shared link is sealed with a key Strata can no longer open, so the link cannot be re-derived.",
    recover: LIST_SPACES,
    avoid: "Do not retry the share; nothing an agent can call repairs it.",
  },
  slug_taken: {
    truth: "Something in this Strata already holds that slug, and a slug is unique within its scope.",
    recover: LIST_PAGES,
    avoid: "Do not append a number to the slug; update the thing that already exists.",
  },
  slug_collision: {
    truth: "The destination Space already holds a page with this slug.",
    recover: LIST_PAGES,
    avoid: "Do not move the page under a suffixed slug; rename one of the two first.",
  },
  invalid_since: {
    truth: "`since` is the integer version you last rendered, not a timestamp.",
    recover: READ_PAGE,
    avoid: "Do not send a date.",
  },
  stale_space_page_selection: {
    truth: "The Pages in this Space changed after this selection was loaded, so nothing from the selection was written.",
    recover: LIST_PAGES,
    avoid: "Do not retry the old selection; rebuild it from the current Space membership.",
  },

  /* ---- lifecycle ---------------------------------------------------- */

  unshared_by_user: {
    truth:
      "The person unshared this page themselves, and only a direct request from them re-shares it.",
    recover: null,
    avoid:
      "Do not re-share it because it would be convenient, and do not look for a flag that overrides it - on_behalf_of_user only records who asked. Send the person to their own Home to share it again.",
  },
  confirm_required: {
    truth: "Deleting erases the page for everyone with no undo, and its links stop opening, so it takes an explicit confirmation.",
    recover: LIST_PAGES,
    avoid: "Do not resend with confirm:true on your own initiative; only the person asks for erasure.",
  },
  question_changed: {
    truth: "The question was rewritten after the page you are answering from was loaded.",
    recover: READ_PAGE,
    avoid: "Do not re-file the old answer against the new wording.",
  },
  version_conflict: {
    truth:
      "The page is not at the version this write was built against; something else wrote to it in between.",
    recover: READ_PAGE,
    avoid:
      "Do not retry with the same base_version, and do not overwrite the page wholesale to get past it — that discards the other write.",
    docs: ["llms"],
  },
  put_is_create_only: {
    truth: "`PUT /v1/pages` creates; a page with that slug already exists.",
    recover: {
      method: "PATCH",
      path: "/v1/pages/{id}/spec",
      then: "send only the operations that change, against the page's current base_version",
    },
    avoid: "Do not create a second page to carry the update.",
  },
  quota_exceeded: {
    truth: "This namespace has reached the limit named in the message for that resource.",
    recover: LIST_PAGES,
    avoid: "Do not retry; delete what is no longer needed, or tell the person the limit was reached.",
    docs: ["llms"],
  },

  /* ---- authoring ---------------------------------------------------- */

  invalid_spec: {
    truth:
      "The JSON Render spec failed the schema. `path` points at the first failing pointer and `errors` carries every other one in the same request.",
    recover: READ_MANIFEST,
    avoid: "Do not retry the same spec, and do not invent components or styling fields.",
    docs: ["llms"],
  },
  contract_changed: {
    truth:
      "The contract you learned is older than the one this server runs: `learned` is yours, `contract_version` is the server's, and `changes` lists what moved between them, oldest first. Nothing was written.",
    recover: RELEARN_CONTRACT,
    avoid: "Do not resend the same request with the new version pasted into the header; what changed may be the very thing the request does.",
    docs: ["llms"],
  },
  unknown_component: {
    truth:
      "That component is not in the current catalog. `valid` is the whole catalog and `closest` is the catalog name nearest to what you sent.",
    recover: READ_MANIFEST,
    avoid: "Do not keep a component name you learned from an older catalog, and do not invent one.",
    docs: ["llms"],
  },
  invalid_ops: {
    truth: "One RFC 6902 operation in this patch is not addressable against the page; `error` names its index.",
    recover: READ_PAGE,
    avoid: "Do not resend the whole element map as one operation; that is a rewrite wearing a patch's clothes.",
  },
  empty_ops: {
    truth: "A patch with no operations is not a write.",
    recover: null,
  },
  too_many_ops: {
    truth: "This patch carries more operations than one write may hold.",
    recover: {
      method: "PUT",
      path: "/v1/pages/{id}/spec",
      then: "send the rebuilt page in one call when the whole document is being replaced",
    },
    avoid: "Do not split one logical edit across several patches to fit under the cap.",
  },
  empty_patch: {
    truth: "This request names no field to change.",
    recover: null,
  },
  slug_required: {
    truth: "Creating a page needs a stable slug.",
    recover: null,
  },
  title_required: {
    truth: "Creating a page needs a title.",
    recover: null,
  },
  summary_required: {
    truth: "Every write says what it changed, in one line, for the reader's history.",
    recover: null,
    avoid: "Do not restate the page's standing state here; `summary` is this write's delta, `answer.verdict` is the standing state.",
  },
  summary_too_long: {
    truth:
      "The summary is longer than the what-changed strip holds, and it renders unclamped, so it would become the text wall the page budget exists to prevent.",
    recover: null,
    avoid: "Do not move the overflow into the title.",
  },
  invalid_space_emoji: {
    truth: "`space.emoji` is exactly one complete Unicode emoji.",
    recover: null,
  },
  invalid_space: {
    truth: "`space.slug` and `space.name` must both be non-empty.",
    recover: null,
  },
  space_name_too_long: {
    truth:
      "A Space name is a 2-4 word navigation label, and this one is over the character limit in the message.",
    recover: null,
    avoid: "Do not abbreviate into an acronym; put the detail on the Page.",
  },
  literal_markup: {
    truth:
      "This field is plain text, so Markdown or HTML markers in it render as the characters they are.",
    recover: null,
    avoid: "Do not escape the markers; remove them.",
  },
  element_count: {
    truth: "This page carries more elements than one page's worth of answer.",
    recover: READ_GUIDE,
    avoid: "Do not keep the count by nesting; split the page on a real boundary or cut what is not the answer.",
  },
  component_monotony: {
    truth: "One component type repeats or holds a large share of this page's text; that may serve the reader's task.",
    recover: READ_GUIDE,
    avoid: "Do not add variety solely to clear this advisory; change the presentation only if it improves finding, comparing, or using the information.",
  },
  component_choice: {
    truth: "This advisory identifies a component choice to reconsider, such as a table with only one row to compare.",
    recover: READ_GUIDE,
    avoid: "Do not change components or add filler data just to clear this advisory; weigh comparison, exact lookup, focused browsing, and the supported interactions against the reader's task.",
  },
  summary_body_duplication: {
    truth: "The write summary and the page body say the same thing.",
    recover: null,
    avoid: "Do not paraphrase one into the other; the summary is this write's delta.",
  },
  multiple_quotes: {
    truth: "This page carries more quoted passages than a page can carry and still be read.",
    recover: null,
  },
  address_drift: {
    truth:
      "This write renumbered addresses that are the reader's spatial memory: an edit changes what is at an address, it does not move the addresses.",
    recover: READ_PAGE,
    avoid: "Do not rebuild the element map to make ids contiguous.",
  },
} as const satisfies Record<string, Recovery>;

/** The entry for a code, or `undefined` for a code with no entry yet. */
export function recoveryFor(code: string): Recovery | undefined {
  return (RECOVERY as Record<string, Recovery>)[code];
}

/** Every code this table knows, in declaration order. */
export const RECOVERY_CODES: readonly string[] = Object.keys(RECOVERY);

/** The entries one discovery document renders, in declaration order. */
export function documentedRecoveries(
  surface: RecoverySurface,
): readonly (readonly [string, Recovery])[] {
  return Object.entries(RECOVERY as Record<string, Recovery>)
    .filter(([, entry]) => entry.docs?.includes(surface) === true);
}

/** Every distinct path the table would send a caller to. */
export const RECOVERY_PATHS: readonly string[] = [
  ...new Set(
    Object.values(RECOVERY as Record<string, Recovery>)
      .map((entry) => entry.recover?.path)
      .filter((path): path is string => path !== undefined),
  ),
];
