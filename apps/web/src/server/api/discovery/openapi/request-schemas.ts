/**
 * Request bodies compiled from the Zod schemas the handlers enforce, so the contract cannot drift.
 * `io: "output"` publishes the post-normalization shape (after `.trim()`, `.toLowerCase()`).
 */
import * as z from "zod";

import { AuthStartBodySchema, AuthVerifyBodySchema } from "@/server/auth/handlers";
import {
  RefreshTokenBodySchema,
  RevokeTokenBodySchema,
  StaticAgentBodySchema,
} from "@/server/credentials/handlers";
import { SetPageBodySchema } from "@/server/pages/handlers";
import { CreateSpaceBodySchema, UpdateSpaceBodySchema } from "@/server/spaces/handlers";

/**
 * `draft-2020-12` matches OpenAPI 3.1.1. Inline reuse and no cycles keep a plain tree, since a
 * `$ref` into `#/$defs` would dangle once spliced into `components.schemas`.
 */
const TO_OPENAPI = {
  target: "draft-2020-12",
  io: "output",
  reused: "inline",
  cycles: "throw",
  unrepresentable: "throw",
} as const;

interface Overlay {
  /** Merged onto the schema itself: prose, and rules Zod cannot express. */
  readonly document?: Record<string, unknown>;
  /** Merged onto one compiled property each. */
  readonly properties?: Readonly<Record<string, Record<string, unknown>>>;
}

/**
 * The compiled schema with descriptions merged on. Documenting a property the schema lacks throws,
 * so renamed fields cannot leave orphaned prose.
 */
function fromZod(schema: z.ZodType, overlay: Overlay = {}): Record<string, unknown> {
  const json = z.toJSONSchema(schema, TO_OPENAPI) as Record<string, unknown> & {
    properties?: Record<string, Record<string, unknown>>;
  };
  delete json["$schema"];
  Object.assign(json, overlay.document ?? {});
  for (const [name, prose] of Object.entries(overlay.properties ?? {})) {
    const property = json.properties?.[name];
    if (property === undefined) {
      throw new Error(`openapi: ${name} is documented but no longer in the schema`);
    }
    Object.assign(property, prose);
  }
  return json;
}

/** Shared by three bodies. */
const DRIVER = {
  description:
    "Which agent this is, self-declared and validated against Strata's seeded driver list. An unknown value is refused with 422 invalid_driver and the accepted list in `valid`; there is no dynamic registration.",
  examples: ["instinct", "claude-code", "claude", "chatgpt", "strata-mobile", "generic", "other"],
};

export const REQUEST_SCHEMAS: Record<string, unknown> = {
  StaticCredentialRequest: fromZod(StaticAgentBodySchema, {
    properties: { driver: DRIVER },
  }),
  AuthStartRequest: fromZod(AuthStartBodySchema, {
    properties: {
      email: {
        description:
          "The address the person gave you. Lowercased on arrival; it is the whole of their identity to Strata.",
      },
      driver: DRIVER,
    },
  }),
  AuthVerifyRequest: fromZod(AuthVerifyBodySchema, {
    properties: {
      email: {
        description: "The same address start_auth was given. A different one is a different Strata.",
      },
      code: {
        description: "What the person read out of the email. Spacing is forgiven; never store or log it.",
      },
      driver: DRIVER,
      mode: {
        default: "rotating",
        description:
          "Ask for static only if you genuinely cannot store a rotating pair; a static credential is rotated only by the person revoking it.",
      },
      person_name: {
        description:
          "The person's name as you know it. Used only when this call creates the Strata: it names the Strata \"<name>'s Strata\" and is what Home greets them by. Ignored when the address already has a Strata, and never overwritten afterwards.",
      },
      display_name: {
        description:
          "What to call this Strata, when the person calls it something other than \"<their name>'s Strata\". Prefer person_name. Used only when this call creates it; omitted, a Strata created here is called \"Your Strata\" until the person renames it from Home.",
      },
    },
  }),
  RefreshRequest: fromZod(RefreshTokenBodySchema, {
    properties: {
      refresh_token: { description: "The sr_ token from your vault. Send no Authorization header." },
    },
  }),
  RevokeRequest: fromZod(RevokeTokenBodySchema, {
    document: {
      description:
        "The body may be omitted entirely: the credential in the Authorization header names the grant to revoke. Send `token` instead when you hold only the refresh token, which is the one case a header cannot cover.",
    },
    properties: {
      token: {
        description: "An access or refresh token. Omit it and the Authorization header is used.",
      },
    },
  }),
  SpaceCreateRequest: fromZod(CreateSpaceBodySchema, {
    properties: {
      slug: { description: "Lowercase letters, digits and single hyphens: 2026-q3-review." },
      emoji: { description: "Exactly one complete Unicode emoji grapheme" },
      shared: { default: false },
    },
  }),
  SpacePatchRequest: fromZod(UpdateSpaceBodySchema, {
    properties: {
      emoji: { description: "Exactly one complete Unicode emoji grapheme" },
    },
  }),
  PagePatchRequest: fromZod(SetPageBodySchema, {
    // At-least-one-field is a handler rule Zod does not state.
    document: { minProperties: 1 },
    properties: {
      space_id: { format: "uuid" },
      title: {
        description: "Rename the page. Title is metadata, so it can change without a content write.",
      },
      live_steps: {
        description:
          "Show or hide the page's write trail in its chrome - the collapsible \"View steps\" section. Metadata like title, so it flips without a content write and without moving the version. Off by default on every page.",
      },
      on_behalf_of_user: {
        description:
          "Attribution only: it records that this write is the person's own request, and it appears in the exposure log as such. It does not re-share a page the person unshared - that refusal (409 unshared_by_user) stands, and only the person, from their own Home, lifts it.",
      },
    },
  }),
};
