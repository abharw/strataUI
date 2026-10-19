/**
 * Hand-written response envelopes, error bodies and spec fragments with no single Zod source.
 * Request bodies are compiled in `request-schemas.ts`.
 */
import { MAX_ASSET_CREDIT_CHARS, MAX_SPACE_NAME_CHARS } from "@/page-content/document/limits";
import { REFRESH_REPLAY_GRACE_SECONDS } from "@/server/credentials/config";
import { schemaRef } from "./shared";

export const RESPONSE_SCHEMAS: Record<string, unknown> = {
  ApiError: {
    type: "object",
    required: ["error", "code", "next"],
    properties: {
      error: { type: "string" },
      code: { type: "string" },
      path: { type: "string" },
      valid: { type: "array", items: {} },
      next: { type: "array", items: { type: "string" }, minItems: 1, description: "Operation ids worth calling next." },
      recover: {
        type: "object",
        description: "The whole next call, as a complete URL, on failures where the caller has lost the credential it would need to look one up.",
        required: ["method", "path", "then"],
        properties: {
          method: { type: "string" },
          path: { type: "string" },
          body: { type: "object", additionalProperties: true },
          then: { type: "string", description: "What to do with the response, in one line." },
        },
      },
      avoid: {
        type: "string",
        description: "The plausible wrong move this failure invites, named so it is not made.",
      },
      closest: {
        type: "string",
        description: "On unknown_component, the catalog name nearest the one that was sent.",
      },
      contract_version: {
        type: "string",
        description: "The contract this body was written against. Re-read /llms.txt when it differs from the one you learned.",
      },
    },
    additionalProperties: true,
  },
  InsufficientScopeError: {
    allOf: [
      schemaRef("ApiError"),
      {
        type: "object",
        properties: {
          code: { const: "insufficient_scope" },
          scope: { type: "string", description: "The scope the route required" },
        },
      },
    ],
  },
  InvalidCodeError: {
    allOf: [
      schemaRef("ApiError"),
      {
        type: "object",
        properties: { code: { const: "invalid_code" } },
      },
    ],
    description:
      "One body for wrong, expired, and already-redeemed codes. Never infer which from timing or wording; ask the person for a fresh code.",
  },
  InvalidGrantError: {
    allOf: [
      schemaRef("ApiError"),
      {
        type: "object",
        properties: { code: { const: "invalid_grant" } },
      },
    ],
    description:
      "A refresh connection that cannot recover. The cause may be expiry, revocation, or replay outside the bounded lost-response recovery; do not infer which. POST /v1/auth/start is the only way back.",
  },
  CredentialResponse: {
    type: "object",
    required: ["warnings", "namespace_id", "grant_id", "label", "access_token", "token_type", "scope"],
    description:
      "The only time a token exists in plaintext. Served no-store. Vault access_token and refresh_token and put them nowhere else.",
    properties: {
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Advisory guidance the call did not refuse, for example a label that was truncated. Read them before you act on the rest.",
      },
      namespace_id: { type: "string", format: "uuid", description: "The Strata this credential opens. It is not a routing parameter: no request body may name a namespace." },
      namespace_display_name: {
        type: "string",
        description: "What the person calls this Strata. Say it back to them so a mistyped address is caught before you write.",
      },
      grant_id: { type: "string", format: "uuid", description: "This connection, as the person sees it in their agent list and as writes record their provenance." },
      label: { type: "string", maxLength: 40 },
      mode: {
        type: "string",
        enum: ["rotating", "static"],
        description: "Present on a static credential, which never expires and has no refresh token; revoking it is the only rotation. A rotating credential omits the field.",
      },
      access_token: { type: "string", description: "sw_ for a writer, sv_ for a viewer. Send as Authorization: Bearer; never in a URL." },
      refresh_token: {
        type: ["string", "null"],
        description: `sr_, or null on a static credential - the key is present and null so a client storing it unconditionally stores the fact. A refresh rotates it; one retry of the old token within ${String(REFRESH_REPLAY_GRACE_SECONDS)} seconds can recover a lost response only while its direct successor is unspent. Serialize refreshes through one credential owner.`,
      },
      token_type: { const: "Bearer" },
      expires_in: {
        type: ["integer", "null"],
        description: "Seconds until access_token expires: 3600 for a rotating credential, null for a static one.",
      },
      scope: {
        type: "string",
        description: "Space-separated. A writer holds pages:read pages:write namespace:pair; a viewer holds pages:read alone, permanently.",
      },
      next: { type: "array", items: { type: "string" }, minItems: 1, description: "Operation ids worth calling next." },
    },
  },
  AuthStartResponse: {
    type: "object",
    required: ["warnings", "expires_in", "interval", "next"],
    description:
      "Identical for an address Strata knows and one it has never seen. Nothing here says whether the person has a Strata.",
    properties: {
      warnings: { type: "array", items: { type: "string" } },
      expires_in: { type: "integer", const: 600, description: "Ten minutes. Single use." },
      interval: {
        type: "integer",
        description: "Seconds to leave before asking the person again whether the mail has arrived.",
      },
      next: { type: "array", items: { type: "string" }, minItems: 1, description: "Operation ids worth calling next." },
    },
  },
  RevokeResponse: {
    type: "object",
    description: "Empty. 200 is the whole answer, including for a grant that was already revoked or a token Strata does not recognise - saying which would be an oracle.",
    maxProperties: 0,
    additionalProperties: false,
  },
  OwnerAgentsResponse: {
    type: "object",
    required: ["agents"],
    properties: {
      agents: { type: "array", items: schemaRef("OwnerAgent") },
    },
  },
  OwnerAgent: {
    type: "object",
    required: ["grant_id", "kind", "driver", "label", "mode", "scope", "created_at", "last_used_at", "revoked_at", "issued_by_grant_id", "issued_by_label"],
    description: "One connection as the person sees it. No token, code, or hash is recoverable from this row.",
    properties: {
      grant_id: { type: "string", format: "uuid" },
      kind: { type: "string", enum: ["writer", "viewer"] },
      driver: { type: "string" },
      label: { type: "string", maxLength: 40 },
      mode: { type: "string", enum: ["rotating", "static"] },
      scope: { type: "array", items: { type: "string", enum: ["pages:read", "pages:write", "namespace:pair"] } },
      created_at: { type: "string", format: "date-time" },
      last_used_at: { type: ["string", "null"], format: "date-time", description: "Resolved to the minute; the resource server does not write it back on every call." },
      revoked_at: { type: ["string", "null"], format: "date-time", description: "Non-null means every token under this grant is already dead." },
      issued_by_grant_id: { type: ["string", "null"], format: "uuid", description: "The grant that minted this one; null means the person's own email code did." },
      issued_by_label: { type: ["string", "null"], maxLength: 40, description: "That grant's label, resolved so the row reads without a second lookup." },
    },
  },
  OwnerSearchResponse: {
    type: "object",
    required: ["page_ids"],
    description: "Ids only. Home holds the inventory these join against, so the match never has to send a document or a capability URL to say what it found.",
    properties: {
      page_ids: { type: "array", items: { type: "string", format: "uuid" } },
    },
  },
  OwnerSearchRefusal: {
    type: "object",
    required: ["error"],
    description: "The owner surfaces answer their own refusals in one sentence; they carry no `code` or `next`, because the person reading them is not an agent choosing a next call.",
    properties: {
      error: { type: "string" },
    },
  },
  SpaceResult: {
    type: "object",
    required: ["space_id", "slug", "name", "emoji", "space_url"],
    properties: {
      space_id: { type: "string", format: "uuid" },
      slug: { type: "string" },
      name: { type: "string" },
      emoji: { type: "string", description: "Exactly one complete Unicode emoji grapheme chosen for this Space" },
      space_url: {
        type: ["string", "null"],
        format: "uri",
        description: "The stable shared-Space URL. Returned when shared:true first mints it and again whenever the same share is requested.",
      },
      shared_pages_added: { type: "integer", description: "Active Pages added by the first Space-sharing snapshot; zero on repeated requests" },
      already_shared: { type: "boolean", description: "Present when a share was requested on a Space that already had its stable link" },
      note: { type: "string" },
    },
  },
  SpaceListResult: {
    type: "object",
    required: ["spaces"],
    properties: {
      spaces: {
        type: "array",
        items: {
          type: "object",
          required: ["space_id", "slug", "name", "emoji", "shared_bundle", "page_count", "shared_page_count"],
          properties: {
            space_id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            name: { type: "string" },
            emoji: { type: "string", description: "Exactly one complete Unicode emoji grapheme chosen for this Space" },
            shared_bundle: { type: "boolean" },
            page_count: { type: "integer" },
            shared_page_count: { type: "integer" },
            freshest_change: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
  },
  SpaceDeleteResult: {
    type: "object",
    required: ["space_id", "deleted"],
    properties: {
      space_id: { type: "string", format: "uuid" },
      deleted: { type: "boolean" },
      pages_deleted: { type: "integer" },
    },
  },
  AssetReserveRequest: {
    type: "object",
    required: ["filename", "media_type", "size_bytes"],
    properties: {
      filename: { type: "string", description: "What the reader sees, and what the file downloads as." },
      media_type: { type: "string", description: "png, jpeg, webp, gif, svg, pdf, plain text or csv - types a browser shows inline." },
      size_bytes: {
        type: "integer",
        description:
          "The exact byte length you are about to send; a mismatch is refused. It is exact because the quota is committed to it in the same transaction that measures it, so reserving a set of files and then pushing them cannot overrun the cap.",
      },
      credit: {
        type: "string",
        maxLength: MAX_ASSET_CREDIT_CHARS,
        description: "Who the file came from, in a few words. Rendered as one quiet caption line under it.",
      },
      source_url: {
        type: "string",
        format: "uri",
        description: "Where it came from. An https URL, rendered as a plain link and never fetched by Strata.",
      },
    },
  },
  AssetReserveResult: {
    type: "object",
    required: ["asset_id", "resource_id", "upload_url", "upload_expires_at", "max_bytes"],
    properties: {
      asset_id: { type: "string", format: "uuid", description: "The id the /v1/assets/{id} routes take - which also accept the resource_id." },
      resource_id: { type: "string", description: "The only asset handle a page ever names." },
      upload_url: { type: "string", description: "One-shot, signed, short-lived. Send the raw bytes here with PUT." },
      upload_expires_at: { type: "string", format: "date-time" },
      max_bytes: { type: "integer" },
    },
  },
  AssetFacts: {
    type: "object",
    required: ["asset_id", "resource_id", "filename", "content_type", "size_bytes", "stored", "sha256", "width", "height", "credit", "source_url", "created_at"],
    description: "One file, as the host knows it: what was declared, what the bytes turned out to be, and the attribution it carries. Images also get a small derived copy the host serves to tiles; it is not a file, has no id, and costs nothing against the quota, so it appears in no field here.",
    properties: {
      asset_id: { type: "string", format: "uuid", description: "The id DELETE and the upload-url re-issue take; those routes also accept resource_id." },
      resource_id: { type: "string", description: "The only asset handle a page ever names." },
      filename: { type: "string" },
      content_type: { type: "string" },
      size_bytes: { type: "integer" },
      stored: { type: "boolean", description: "False while the reservation is still waiting for its bytes." },
      sha256: { type: ["string", "null"], description: "Hex digest of the stored bytes; null until they land." },
      width: { type: ["integer", "null"], description: "Pixels, measured from the image header. Null for anything that is not a measurable image." },
      height: { type: ["integer", "null"] },
      credit: { type: ["string", "null"] },
      source_url: { type: ["string", "null"] },
      created_at: { type: "string", format: "date-time" },
    },
  },
  AssetDeleteResult: {
    type: "object",
    required: ["resource_id", "released_bytes", "deleted"],
    properties: {
      resource_id: { type: "string" },
      released_bytes: { type: "integer", description: "What the quota got back. Zero for a reservation whose bytes never arrived." },
      deleted: { type: "boolean" },
    },
  },
  AssetUsageResult: {
    type: "object",
    required: ["stored_bytes", "committed_bytes", "quota_bytes", "max_bytes", "allowed_media_types", "upload_window_seconds", "assets", "count", "page_max"],
    properties: {
      stored_bytes: { type: "integer", description: "Bytes whose files have actually landed." },
      committed_bytes: {
        type: "integer",
        description: "Stored bytes plus live reservations. This is the number the next reservation is checked against.",
      },
      quota_bytes: { type: "integer" },
      max_bytes: { type: "integer", description: "The per-file cap." },
      allowed_media_types: { type: "array", items: { type: "string" } },
      upload_window_seconds: { type: "integer", description: "How long a minted upload URL stays usable." },
      assets: { type: "array", items: schemaRef("AssetFacts"), description: "Newest first, at most page_max of them." },
      count: { type: "integer", description: "Files in this response, not in the Strata." },
      page_max: { type: "integer" },
    },
  },
  DecisionLogResult: {
    type: "object",
    required: ["answers", "count", "next_before"],
    properties: {
      count: { type: "integer", description: "Answers in this page, not in the log." },
      next_before: {
        type: ["string", "null"],
        description: "Send back as `before` for the next page; null when this was the last one. Ordering is answered_at then id, both descending, so two answers recorded in the same microsecond cannot straddle the boundary.",
      },
      answers: {
        type: "array",
        items: {
          type: "object",
          required: ["page_id", "page_title", "approval_id", "ask_seq", "question", "chosen_id", "chosen_label", "answered_by", "answered_at"],
          properties: {
            page_id: { type: "string", format: "uuid" },
            page_title: { type: "string" },
            space_name: { type: ["string", "null"] },
            page_deleted_at: { type: ["string", "null"], format: "date-time" },
            approval_id: { type: "string" },
            ask_seq: { type: "integer" },
            question_key: { type: "string" },
            question: { type: "string" },
            context: { type: "string" },
            options: { type: "array", items: { type: "object" } },
            chosen_id: { type: "string" },
            chosen_label: { type: "string" },
            answered_by: { type: "string" },
            answered_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  PageWriteResult: {
    type: "object",
    required: ["warnings", "text_chars", "budget_remaining", "version", "elements", "owner_url", "url", "registry_version", "page_id", "space_id", "slug", "shared"],
    properties: {
      warnings: { type: "array", items: { type: "string" }, description: "Advisory guidance the write did not refuse: crossing the 40-element aim, repeated components or dominant text share, a component choice to reconsider such as a one-row table, partial summary/body overlap, or address drift. Reconsider presentation against the reader's task; these observations do not determine the best component. Objective presentation failures return 422 before persistence instead." },
      text_chars: { type: "integer", description: "Visible text on the stored page, in characters. code-block code and approval context are not counted." },
      budget_remaining: { type: "integer", description: "Characters left of this page's text budget (1,500 living, 3,000 standing), floored at zero" },
      summary_chars: { type: "integer", description: "Length of the summary this write carried" },
      elements_dropped: { type: "integer", description: "Rewrite only: element ids present before and absent after" },
      elements_renamed: { type: "integer", description: "Rewrite only: elements that kept type and first text under a new id" },
      version: { type: "integer", description: "Send this as base_version on the next edit" },
      elements: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "type"],
          properties: { id: { type: "string" }, type: { type: "string" }, items: { type: "integer" } },
        },
      },
      owner_url: { type: "string", format: "uri", description: "Canonical Page URL for the person who owns this Strata. It opens owner controls and approvals in their signed-in browser; it is not a share capability." },
      url: { type: "string", format: "uri", description: "The standalone Page capability URL for recipients. Forward it only to someone who may read the page." },
      registry_version: { type: "integer" },
      page_id: { type: "string", format: "uuid" },
      space_id: { type: "string", format: "uuid" },
      slug: { type: "string" },
      shared: { type: "boolean" },
      approvals: {
        type: "object",
        required: ["open", "asked_again"],
        description:
          "Only on a write to a page that asks something. `open` is every question still waiting on the person after this write; `asked_again` is the questions this write closed and reopened, which happens when an answered question's wording changes or it is written again. Nothing calls you back - read the page to see what came back.",
        properties: {
          open: { type: "array", items: schemaRef("AskingRef") },
          asked_again: { type: "array", items: schemaRef("AskingRef") },
        },
      },
    },
  },
  AskingRef: {
    type: "object",
    required: ["approval_id", "ask_seq", "question_key", "question"],
    properties: {
      approval_id: { type: "string" },
      ask_seq: { type: "integer", description: "Which asking of this question is on the page; the same words asked again are a new asking." },
      question_key: { type: "string", description: "Hash of the question, its context and every option." },
      question: { type: "string" },
    },
  },
  PageListResult: {
    type: "object",
    required: ["pages", "registry_version", "approvals_open"],
    properties: {
      registry_version: { type: "integer" },
      approvals_open: {
        type: "integer",
        description: "Questions across these pages that are waiting on the person. One call answers 'what needs me'.",
      },
      pages: {
        type: "array",
        items: {
          type: "object",
          required: ["page_id", "space_id", "space_slug", "space_name", "space_emoji", "slug", "title", "kind", "shared", "version"],
          properties: {
            page_id: { type: "string", format: "uuid" },
            space_id: { type: "string", format: "uuid" },
            space_slug: { type: "string" },
            space_name: { type: "string" },
            space_emoji: { type: "string", description: "Exactly one complete Unicode emoji grapheme chosen for this page's Space" },
            slug: { type: "string" },
            title: { type: "string" },
            kind: { type: "string", enum: ["living", "standing"] },
            shared: { type: "boolean" },
            exposure_actor: { type: "string", enum: ["agent", "user", "system"] },
            exposure_updated_at: { type: "string", format: "date-time" },
            version: { type: "integer" },
            updated_at: { type: "string", format: "date-time" },
            last_summary: { type: ["string", "null"] },
            written_registry_version: { type: "integer", description: "The registry version this page was last validated against" },
            approvals: {
              type: "object",
              required: ["open", "answered"],
              description: "Questions on this page: open is waiting on the person, answered has a recorded answer. Only the current asking of each question counts, and a question taken off the page counts as neither.",
              properties: {
                open: { type: "integer" },
                answered: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
  PageDetailResult: {
    type: "object",
    required: ["source", "author", "page_id", "space", "shared", "exposure", "meta", "spec", "version"],
    properties: {
      source: { type: "string" },
      author: { type: "string", enum: ["agent"] },
      page_id: { type: "string", format: "uuid" },
      space: {
        type: "object",
        required: ["id", "slug", "name", "emoji"],
        properties: {
          id: { type: "string", format: "uuid" },
          slug: { type: "string" },
          name: { type: "string" },
          emoji: { type: "string", description: "Exactly one complete Unicode emoji grapheme chosen for this Space" },
        },
      },
      shared: { type: "boolean" },
      exposure: {
        type: "object",
        required: ["actor", "updated_at"],
        properties: { actor: { type: "string", enum: ["agent", "user", "system"] }, updated_at: { type: "string", format: "date-time" } },
      },
      meta: {
        type: "object",
        required: ["title", "slug", "kind", "shared", "owner_url", "url", "written_registry_version", "created_at", "updated_at"],
        properties: {
          title: { type: "string" },
          slug: { type: "string" },
          kind: { type: "string", enum: ["living", "standing"] },
          source_event: schemaRef("SourceEvent"),
          shared: { type: "boolean", description: "Whether this Page is currently shared, repeated here so one page read answers it without listing pages." },
          owner_url: { type: "string", format: "uri", description: "Canonical session-backed Page URL for the owner." },
          url: { type: ["string", "null"], format: "uri", description: "Read-only Page capability URL for recipients, or null when this stored page has no recoverable capability key." },
          written_registry_version: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
        additionalProperties: true,
      },
      spec: schemaRef("StrataSpec"),
      version: { type: "integer" },
      registry_version: { type: "integer" },
      approvals: {
        type: "object",
        required: ["open", "answers"],
        description:
          "The questions this page asks and the answers it has. Nothing calls you back: reading the page is how an agent finds out. `open` is what is still waiting on the person and never contains an answered question; `answers` is what came back. `ask_seq` and `question_key` identify the asking an answer is filed under, and both must be sent back with a tap.",
        properties: {
          open: {
            type: "array",
            items: {
              type: "object",
              required: ["approval_id", "ask_seq", "question_key", "question"],
              properties: {
                approval_id: { type: "string" },
                ask_seq: { type: "integer", description: "Which asking of this question is on the page; the same words asked again are a new asking." },
                question_key: { type: "string", description: "Hash of the question, its context and every option; changing any of them voids an answer given to the older wording." },
                question: { type: "string" },
              },
            },
          },
          answers: {
            type: "array",
            items: {
              type: "object",
              required: ["approval_id", "ask_seq", "question_key", "question", "chosen_id", "chosen_label", "answered_by", "answered_at"],
              properties: {
                approval_id: { type: "string" },
                ask_seq: { type: "integer" },
                question_key: { type: "string" },
                question: { type: "string" },
                chosen_id: { type: "string" },
                chosen_label: { type: "string" },
                answered_by: { type: "string" },
                answered_at: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
    additionalProperties: true,
  },
  PageSummaryResult: {
    type: "object",
    required: ["page_id", "slug", "title", "version", "shared", "element_count", "live_steps", "outline", "registry_version"],
    properties: {
      source: { type: "string" },
      author: { type: "string", enum: ["agent"] },
      page_id: { type: "string", format: "uuid" },
      slug: { type: "string" },
      title: { type: "string" },
      version: { type: "integer" },
      shared: { type: "boolean" },
      element_count: { type: "integer" },
      live_steps: { type: "boolean", description: "Whether the page's chrome shows its write trail as \"View steps\". Set it on a write, or flip it with set_page." },
      answer: {
        oneOf: [schemaRef("Answer"), { type: "null" }],
        description: "The page's standing state, or null on a page written before answers existed",
      },
      outline: { type: "string", description: "One indented line per element: id, type, and item count" },
      registry_version: { type: "integer" },
    },
  },
  FindResult: {
    type: "object",
    required: ["page_id", "elements", "match_count", "truncated", "registry_version"],
    properties: {
      source: { type: "string" },
      author: { type: "string", enum: ["agent"] },
      page_id: { type: "string", format: "uuid" },
      elements: { type: "array", items: { type: "object" } },
      match_count: { type: "integer" },
      truncated: { type: "boolean" },
      remedy: { type: "string", description: "Present only when truncated" },
      registry_version: { type: "integer" },
    },
  },
  PageUpdateResult: {
    type: "object",
    required: ["page_id", "space_id", "moved", "shared", "exposure_actor", "owner_url", "url"],
    properties: {
      page_id: { type: "string", format: "uuid" },
      space_id: { type: "string", format: "uuid" },
      moved: { type: "boolean", description: "A move always resets the page private" },
      shared: { type: "boolean" },
      exposure_actor: { type: "string", enum: ["agent", "user", "system"] },
      live_steps: { type: "boolean", description: "Whether the page's chrome shows its write trail as \"View steps\", after this change." },
      owner_url: { type: "string", format: "uri", description: "Canonical session-backed Page URL for the owner." },
      url: { type: "string", format: "uri", description: "Read-only Page capability URL, unchanged by a rename, a move, or a share." },
      space_url: { type: ["string", "null"], format: "uri", description: "The stable shared-Space URL, present when this Page-level share first mints it" },
    },
  },
  PageDeleteResult: {
    type: "object",
    required: ["page_id", "slug", "deleted"],
    properties: {
      page_id: { type: "string", format: "uuid" },
      slug: { type: "string" },
      deleted: { type: "boolean" },
    },
  },
  GuideResult: {
    type: "object",
    required: ["topic", "text"],
    properties: {
      topic: { type: "string", enum: ["authoring", "representation", "render-policy", "vocabulary", "examples", "quality"] },
      text: { type: "string" },
    },
  },
  SpaceReference: {
    type: "object",
    required: ["slug", "name", "emoji"],
    properties: {
      slug: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1, maxLength: MAX_SPACE_NAME_CHARS },
      emoji: { type: "string", description: "Exactly one complete Unicode emoji grapheme" },
    },
    additionalProperties: false,
  },
  SourceEvent: {
    type: "object",
    required: ["id", "at", "excerpt"],
    properties: {
      id: { type: "string" },
      at: { type: "string", format: "date-time" },
      excerpt: { type: "string" },
    },
    additionalProperties: false,
  },
  Element: {
    type: "object",
    required: ["type", "props"],
    properties: {
      type: { type: "string", description: "Must exist in the live /v1/manifest catalog" },
      props: { type: "object", description: "Validated against the component schema in /v1/manifest; use the components query to fetch only selected schemas" },
      children: { type: "array", items: { type: "string" }, description: "Child element ids for section, grid, carousel, or card. A leaf may omit this field; it normalizes to an empty array." },
    },
    additionalProperties: false,
  },
  Answer: {
    type: "object",
    required: ["verdict"],
    description:
      "The page's standing state: what it says when nothing has changed. Distinct from the write summary, which is this write's delta and feeds the chrome's what-changed strip.",
    properties: {
      verdict: { type: "string", minLength: 1, maxLength: 140, description: "Where this page stands, in one line" },
    },
    additionalProperties: false,
  },
  SequenceLink: {
    description: "Exactly one of a Strata page id or an http(s) URL. Never a share URL you assembled.",
    oneOf: [
      { type: "object", required: ["page"], properties: { page: { type: "string" } }, additionalProperties: false },
      { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" } }, additionalProperties: false },
    ],
  },
  Sequence: {
    type: "object",
    description:
      "This page's place among its siblings, rendered by the chrome under the title rather than by a block in the body - which is what lets a Day page belong to its Week without a navigation element. Labels come from the target pages' own titles at read time, so this carries only the links. Every arrow is optional; a spec with no sequence stands alone.",
    properties: {
      previous: schemaRef("SequenceLink"),
      next: schemaRef("SequenceLink"),
      up: schemaRef("SequenceLink"),
    },
    additionalProperties: false,
  },
  StrataSpec: {
    type: "object",
    required: ["answer", "root", "elements"],
    description:
      "Visible text is budgeted per field, per collection (600 characters), and per page (1,500 on a living page, 3,000 on a standing one). Over any cap the write is refused with invalid_spec naming the cap, the count, and the overage.",
    properties: {
      answer: schemaRef("Answer"),
      root: { type: "string" },
      elements: { type: "object", additionalProperties: schemaRef("Element") },
      sequence: schemaRef("Sequence"),
    },
    additionalProperties: false,
  },
  PreflightRequest: {
    type: "object",
    required: ["spec"],
    properties: {
      kind: { type: "string", enum: ["living", "standing"], description: "The cadence whose text budget applies; living when omitted" },
      spec: { type: "object", description: "The candidate JSON Render spec, exactly as put_page or rewrite_page_spec would carry it" },
    },
  },
  PreflightResult: {
    type: "object",
    required: ["valid", "kind", "text_chars", "budget_remaining", "collections", "issues"],
    properties: {
      valid: { type: "boolean", description: "True when the candidate passes spec schema, text budgets, and spec-only guidance. Advisory issues leave it true; a repair_required issue makes it false. Preflight does not validate a later request's title or summary, reserve quotas, or check the target page's version, so it does not guarantee a successful write." },
      kind: { type: "string", enum: ["living", "standing"] },
      text_chars: { type: "integer", description: "Visible text the candidate would spend, in characters, counted exactly as a write counts it" },
      budget_remaining: { type: "integer", description: "Characters left of this cadence's text budget (1,500 living, 3,000 standing), floored at zero" },
      collections: {
        type: "array",
        description: "Per-collection spend against the 600-character collection budget",
        items: {
          type: "object",
          required: ["element_id", "type", "prop", "items", "chars", "budget_remaining"],
          properties: {
            element_id: { type: "string" },
            type: { type: "string" },
            prop: { type: "string" },
            items: { type: "integer" },
            chars: { type: "integer" },
            budget_remaining: { type: "integer" },
          },
        },
      },
      issues: {
        type: "array",
        description: "Spec-only guidance: advisory issues become write warnings; repair_required issues would refuse the write. Request-owned title and summary checks and rewrite address drift are not included.",
        items: {
          type: "object",
          required: ["code", "level", "message"],
          properties: {
            code: { type: "string" },
            level: { type: "string", enum: ["advisory", "repair_required"] },
            message: { type: "string" },
            path: { type: "string" },
          },
        },
      },
    },
  },
  PutPageRequest: {
    type: "object",
    required: ["spec", "summary", "slug", "title"],
    properties: {
      space_id: { type: "string", format: "uuid" },
      space: schemaRef("SpaceReference"),
      slug: { type: "string" },
      title: { type: "string" },
      kind: { type: "string", enum: ["living", "standing"] },
      source_event: schemaRef("SourceEvent"),
      spec: schemaRef("StrataSpec"),
      summary: { type: "string", minLength: 1, maxLength: 200 },
      presence: { type: "string", enum: ["open", "done"], description: "Whether more writes are coming in this sequence. Omitted or \"done\" clears the page's live-activity claim; \"open\" asserts it for the next two minutes and each write renews it." },
      live_steps: { type: "boolean", description: "Show this page's write trail in its chrome as a collapsible \"View steps\" section - one row per write, newest first, with the files each write attached. Opt-in per page and off by default; omitted leaves the switch where it is. GET /v1/pages/{id}/summary reports it, and set_page flips it without a content write." },
      asset_refs: { type: "array", items: { type: "string" }, maxItems: 4, description: "resource_ids from reserve_asset to show beside this write's summary in the \"View steps\" trail - a screenshot of the step. Evidence for the trail, not content of the page: a file the page should show goes in an attachment-list. Stored with the write; rendered only while live_steps is on." },
    },
    additionalProperties: false,
  },
  PatchOperation: {
    type: "object",
    required: ["op", "path"],
    properties: {
      op: { type: "string", enum: ["add", "remove", "replace", "move", "copy", "test"] },
      path: { type: "string", description: "JSON Pointer under /answer, /root, /elements or /sequence; /elements itself is not addressable - rebuild with rewrite_page_spec, and /answer may be added, replaced or tested but not removed. /sequence is an ordinary optional object: add it, edit one arrow, or remove it, and the after-image is held to the same shape a whole-spec write is held to" },
      value: {},
      from: { type: "string" },
    },
    additionalProperties: false,
  },
  PatchSpecRequest: {
    type: "object",
    required: ["base_version", "ops", "summary"],
    properties: {
      base_version: { type: "integer", minimum: 0 },
      ops: { type: "array", items: schemaRef("PatchOperation"), maxItems: 200 },
      summary: { type: "string", minLength: 1, maxLength: 200 },
      title: { type: "string", maxLength: 120 },
      source_event: schemaRef("SourceEvent"),
      presence: { type: "string", enum: ["open", "done"], description: "Whether more writes are coming in this sequence. Omitted or \"done\" clears the page's live-activity claim; \"open\" asserts it for the next two minutes and each write renews it." },
      live_steps: { type: "boolean", description: "Show this page's write trail in its chrome as a collapsible \"View steps\" section - one row per write, newest first, with the files each write attached. Opt-in per page and off by default; omitted leaves the switch where it is. GET /v1/pages/{id}/summary reports it, and set_page flips it without a content write." },
      asset_refs: { type: "array", items: { type: "string" }, maxItems: 4, description: "resource_ids from reserve_asset to show beside this write's summary in the \"View steps\" trail - a screenshot of the step. Evidence for the trail, not content of the page: a file the page should show goes in an attachment-list. Stored with the write; rendered only while live_steps is on." },
    },
    additionalProperties: false,
  },
  RewriteSpecRequest: {
    type: "object",
    required: ["base_version", "spec", "summary"],
    properties: {
      base_version: { type: "integer", minimum: 0 },
      spec: schemaRef("StrataSpec"),
      summary: { type: "string", minLength: 1, maxLength: 200 },
      title: { type: "string", maxLength: 120 },
      source_event: schemaRef("SourceEvent"),
      presence: { type: "string", enum: ["open", "done"], description: "Whether more writes are coming in this sequence. Omitted or \"done\" clears the page's live-activity claim; \"open\" asserts it for the next two minutes and each write renews it." },
      live_steps: { type: "boolean", description: "Show this page's write trail in its chrome as a collapsible \"View steps\" section - one row per write, newest first, with the files each write attached. Opt-in per page and off by default; omitted leaves the switch where it is. GET /v1/pages/{id}/summary reports it, and set_page flips it without a content write." },
      asset_refs: { type: "array", items: { type: "string" }, maxItems: 4, description: "resource_ids from reserve_asset to show beside this write's summary in the \"View steps\" trail - a screenshot of the step. Evidence for the trail, not content of the page: a file the page should show goes in an attachment-list. Stored with the write; rendered only while live_steps is on." },
    },
    additionalProperties: false,
  },
};
