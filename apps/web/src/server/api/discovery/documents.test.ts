import { describe, expect, it } from "vitest";

import { AuthStartBodySchema, AuthVerifyBodySchema } from "@/server/auth/handlers";
import {
  RefreshTokenBodySchema,
  RevokeTokenBodySchema,
  StaticAgentBodySchema,
} from "@/server/credentials/handlers";
import { SetPageBodySchema } from "@/server/pages/handlers";
import { CreateSpaceBodySchema, UpdateSpaceBodySchema } from "@/server/spaces/handlers";
import { PAGE_RULES, RENDER_DECISION_RULES } from "@/page-content/authoring/guide";
import {
  CARD_CHILD_TYPES,
  CAROUSEL_CHILD_TYPES,
  GRID_CHILD_TYPES,
} from "@/page-content/document/composition";
import {
  MAX_BREAKDOWN_PARTS,
  MAX_GRID_CHILDREN,
  MAX_ITEM_LIST_ITEMS,
} from "@/page-content/document/limits";
import { guideText } from "@/page-content/authoring/guide";
import { openApi } from "@/server/api/discovery/openapi";
import {
  ANOTHER_ASSISTANT,
  connectLadder,
  DRIVER_SENTENCE,
  START_BODY,
  staticKeyRule,
  VERIFY_BODY,
} from "./connect-copy";
import { llmsText } from "./llms";
import { authMarkdown } from "./auth-md";

import { WEB_SESSION_COOKIE } from "@/server/auth/session-cookie";
import { RECOVERY } from "@/shared/api/recovery";

const ORIGIN = "https://strata.test";

/** OAuth vocabulary: connecting is an emailed code, and no public document may suggest otherwise. */
const OAUTH_VOCABULARY = [/\boauth\b/i, /device_authorization/i];

/** The OpenAPI document as a string-keyed tree, for terse traversal in assertions. */
interface DocumentNode {
  [key: string]: DocumentNode;
}

describe("discovery contract", () => {
  it("never describes connecting as an OAuth flow", () => {
    const documents = [authMarkdown(ORIGIN), llmsText(ORIGIN), JSON.stringify(openApi(ORIGIN))];
    for (const document of documents) {
      for (const term of OAUTH_VOCABULARY) expect(document).not.toMatch(term);
    }
  });

  it("never names the provider that mails the code", () => {
    // Agents only call /v1/auth/start; naming the mail provider would send them looking for its flow.
    for (const document of [authMarkdown(ORIGIN), llmsText(ORIGIN), JSON.stringify(openApi(ORIGIN))]) {
      expect(document).not.toMatch(/workos/i);
      expect(document).not.toMatch(/authkit/i);
      expect(document).not.toMatch(/createMagicAuth|magic ?link/i);
    }
  });

  it("mentions signing in only as the browser address, never as something the agent does", () => {
    // `/home/sign-in` is where the person enters their code; agents never sign in.
    for (const document of [authMarkdown(ORIGIN), llmsText(ORIGIN), JSON.stringify(openApi(ORIGIN))]) {
      for (const match of document.matchAll(/.{12}sign[ -]in.{0,4}/gi)) {
        expect(match[0], match[0]).toContain("/home/sign-in");
      }
    }
  });

  it("tells an agent holding nothing exactly two calls, in order, with literal bodies", () => {
    const auth = authMarkdown(ORIGIN);
    const llms = llmsText(ORIGIN);
    for (const body of [auth, llms]) {
      expect(body).toContain("/v1/auth/start");
      expect(body).toContain(START_BODY);
      expect(body).toContain("/v1/auth/verify");
      expect(body).toContain(VERIFY_BODY);
      expect(body.indexOf("/v1/auth/start")).toBeLessThan(body.indexOf("/v1/auth/verify"));
      expect(body).toContain("/v1/auth/refresh");
      expect(body).toContain("namespace_display_name");
      // The person's name is sent as-is; Strata builds "Ada's Strata" itself.
      expect(body).toContain("person_name");
      expect(body).toMatch(/Never construct(,| or) guess/);
      expect(body).toMatch(/[Nn]ever ask (whether|which)/);
      // Agents must not assume a named assistant has a working connector.
      expect(body).toContain("HTTP tools and durable credential storage");
      expect(body).toContain("integration is not configured");
      expect(body).toMatch(/do not\s+claim it can send a code, borrow your tokens, or mint a credential for it/i);
      expect(body).toMatch(/only when the person names an integration that can hold nothing but a\s+fixed API key|only when the person names an integration that can hold nothing but a fixed API key/);
    }
    expect(llms).toContain(`${ORIGIN}/auth.md`);
    // auth.md is the connection contract only, so llms.txt is longer.
    expect(llms.split("\n").length).toBeGreaterThan(auth.split("\n").length);
  });

  it("renders one connect ladder into both documents rather than two copies", () => {
    // Both documents render the steps from `connect-copy.ts`, so a change reaches both or neither.
    const auth = authMarkdown(ORIGIN);
    const llms = llmsText(ORIGIN);
    const relative = connectLadder("");
    const absolute = connectLadder(ORIGIN);

    for (const [document, ladder, base] of [
      [auth, relative, ""],
      [llms, absolute, ORIGIN],
    ] as const) {
      let cursor = -1;
      for (const rung of [ladder.order, ladder.held, ladder.connect, ladder.start, ladder.verify, ladder.vault]) {
        const at = document.indexOf(rung);
        expect(at, rung.slice(0, 48)).toBeGreaterThan(cursor);
        cursor = at;
      }
      expect(document).toContain(DRIVER_SENTENCE);
      expect(document).toContain(ANOTHER_ASSISTANT);
      expect(document).toContain(staticKeyRule(base));
    }

    // llms.txt uses absolute URLs; auth.md's ladder stays relative.
    expect(llms).toContain(`${ORIGIN}/v1/auth/start`);
    expect(auth).toContain(relative.start);
    expect(auth).not.toContain(absolute.start);
  });

  it("states the render decision and the shared page rules once, in both places", () => {
    // llms.txt and the guide render the same constants, so instructions cannot contradict each other.
    const llms = llmsText(ORIGIN);
    const policy = guideText("render-policy");

    for (const rule of RENDER_DECISION_RULES) {
      expect(llms, rule.slice(0, 40)).toContain(rule);
      expect(policy, rule.slice(0, 40)).toContain(rule);
    }
    for (const rule of Object.values(PAGE_RULES)) {
      expect(llms, rule.slice(0, 40)).toContain(rule);
      expect(policy, rule.slice(0, 40)).toContain(rule);
    }
    // Budgets come from `document/limits.ts`.
    expect(PAGE_RULES.textBudget).toContain("1,500");
    expect(PAGE_RULES.textBudget).toContain("3,000");
  });

  it("teaches the block catalog in the document an agent reads before its first write", () => {
    const llms = llmsText(ORIGIN);

    expect(llms).toContain("Blocks are chosen by data shape");
    expect(llms).toContain("rows with a title and a trailing value");
    expect(llms).toContain("parts of a whole");
    expect(llms).toMatch(/leave every `presentation` null/);

    // Containment rules come from `document/composition.ts`.
    expect(llms).toContain(CARD_CHILD_TYPES.join(", "));
    expect(llms).toContain(GRID_CHILD_TYPES.join(", "));
    expect(llms).toContain(CAROUSEL_CHILD_TYPES.join(", "));
    expect(llms).toContain("`card` is a container with slots rather than a type");

    for (const field of ["`link`", "`empty`", "`sequence`"]) {
      expect(llms, field).toContain(field);
    }

    // Collection ceilings come from the limits constants.
    expect(llms).toContain(`a \`grid\` holds ${String(MAX_GRID_CHILDREN)} children`);
    expect(llms).toContain(`\`item-list\` takes ${String(MAX_ITEM_LIST_ITEMS)} rows`);
    expect(llms).toContain(`\`breakdown\` ${String(MAX_BREAKDOWN_PARTS)} parts`);
  });

  it("describes the phone as a browser that signs in at Home and holds no credential", () => {
    expect(llmsText(ORIGIN)).toMatch(/phone\*\* is a browser, not an agent/);
    expect(authMarkdown(ORIGIN)).toContain("/home/sign-in");
  });

  it("distinguishes the owner's canonical page from a recipient capability", () => {
    const llms = llmsText(ORIGIN);
    const document = openApi(ORIGIN) as {
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
    };
    for (const name of ["PageWriteResult", "PageUpdateResult"]) {
      expect(document.components.schemas[name]?.required).toContain("owner_url");
      expect(document.components.schemas[name]?.properties).toHaveProperty("owner_url");
    }
    const meta = document.components.schemas.PageDetailResult?.properties?.meta as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(meta.required).toContain("owner_url");
    expect(meta.properties).toHaveProperty("owner_url");
    expect(llms).toContain("owner_url");
    expect(llms).toContain("share capability URL");
  });

  it("documents bounded lost-refresh recovery without claiming its cause", () => {
    const documents = [authMarkdown(ORIGIN), llmsText(ORIGIN), JSON.stringify(openApi(ORIGIN))];
    for (const document of documents) {
      expect(document).toContain("30 seconds");
      expect(document).toContain("credential owner");
    }
    expect(llmsText(ORIGIN)).toContain("do not claim which");
  });

  describe("auth.md", () => {
    const body = authMarkdown(ORIGIN);

    it("opens with the tokens-in-hand case and only then the email door", () => {
      const held = body.indexOf("You already hold Strata tokens");
      expect(held).toBeGreaterThan(-1);
      expect(held).toBeLessThan(body.indexOf("/v1/auth/start"));
      expect(body.indexOf("/v1/auth/verify")).toBeLessThan(body.indexOf("## Endpoints"));
      expect(body).toContain("stop at the first that applies");
    });

    it("covers connecting, refresh, and the invalid_grant dead end", () => {
      expect(body.toLowerCase()).toContain("vault both tokens");
      expect(body).toContain("`invalid_grant`");
      // Rendered from RECOVERY, so it matches what POST /v1/auth/verify returns.
      expect(body).toContain("| `invalid_code` |");
      expect(body).toContain(RECOVERY.invalid_code.truth);
      // A dead credential does not mean a dead Strata; asserted from RECOVERY, the single source.
      expect(body).toContain(RECOVERY.invalid_grant.truth);
      expect(body).toContain(RECOVERY.invalid_grant.avoid);
      expect(RECOVERY.invalid_grant.truth).toContain("still exist and are unchanged");
      expect(RECOVERY.invalid_grant.avoid).toContain("never open a second Strata");
      expect(body).toContain("Never put a token in a page, a URL, or a message");
    });

    it("documents every endpoint, scope, and credential kind", () => {
      for (const path of [
        "`/v1/auth/start`",
        "`/v1/auth/verify`",
        "`/v1/credentials/static`",
        "`/v1/auth/refresh`",
        "`/v1/auth/revoke`",
        "/home/agents",
      ]) {
        expect(body).toContain(path);
      }
      for (const token of ["`sw_`", "`sv_`", "`sr_`"]) expect(body).toContain(token);
      for (const scope of ["pages:read", "pages:write", "namespace:pair"]) expect(body).toContain(scope);
      expect(body).toContain('WWW-Authenticate: Bearer realm="strata"');
      expect(body).toContain('error="insufficient_scope"');
    });

    it("names the fixed-key door and points at the machine contracts", () => {
      expect(body).toContain("## Another agent, or a fixed API key");
      expect(body).toContain("/v1/credentials/static");
      expect(body).toMatch(
        /`instinct`, `claude-code`, `claude`, `chatgpt`, `strata-mobile`, `generic`,\s*\n?\s*`other`/,
      );
      expect(body).toContain(`${ORIGIN}/openapi.json`);
      expect(body).toContain(`${ORIGIN}/llms.txt`);
    });

    it("speaks the person's vocabulary: a Strata, not a namespace", () => {
      for (const line of body.split("\n")) {
        if (!line.includes("namespace")) continue;
        expect(line).toMatch(/namespace_display_name|namespace:pair|namespace_id/);
      }
      expect(body).not.toMatch(/\blog in\b|\baccount\b|\bconsent screen is\b/);
      expect(body).toContain("A Strata belongs to an email address");
    });

    it("stays short enough for an agent to read in full", () => {
      expect(body.split("\n").length).toBeLessThan(100);
    });
  });

  describe("openapi.json", () => {
    const document = openApi(ORIGIN) as unknown as DocumentNode;

    it("declares strataCredential as the primary bearer scheme", () => {
      expect(document.security).toEqual([{ strataCredential: [] }]);
      const scheme = document.components.securitySchemes.strataCredential;
      expect(scheme).toMatchObject({ type: "http", scheme: "bearer" });
      for (const prefix of ["sw_", "sv_"]) expect(scheme.description).toContain(prefix);
      // One bearer scheme. `cookieAuth` is the browser session, published so /home reads name
      // what authorizes them.
      expect(Object.keys(document.components.securitySchemes)).toEqual([
        "strataCredential",
        "cookieAuth",
      ]);
      const cookie = document.components.securitySchemes.cookieAuth;
      expect(cookie).toMatchObject({ type: "apiKey", in: "cookie", name: WEB_SESSION_COOKIE });
    });

    it("publishes every connection and owner route", () => {
      expect(document.paths["/v1/auth/start"].post).toMatchObject({ security: [], operationId: "start_auth" });
      expect(document.paths["/v1/auth/verify"].post).toMatchObject({ security: [], operationId: "verify_auth" });
      expect(document.paths["/v1/credentials/static"].post.security).toEqual([
        { strataCredential: ["namespace:pair"] },
      ]);
      expect(document.paths["/v1/auth/refresh"].post).toMatchObject({ security: [], operationId: "refresh_credential" });
      expect(document.paths["/v1/auth/revoke"].post.operationId).toBe("revoke_own_credential");
      // Every other owner act is a Server Action with no path to publish.
      for (const owner of ["/home/agents", "/home/search"]) {
        expect(document.paths[owner]).toBeDefined();
        // Cookie-only; `security: []` would read as public.
        expect(document.paths[owner].get.security).toEqual([{ cookieAuth: [] }]);
      }
      expect(Object.keys(document.paths).filter((path) => path.startsWith("/home/")))
        .toEqual(["/home/agents", "/home/search"]);
    });

    it("fully describes both halves of the email door", () => {
      const start = document.paths["/v1/auth/start"].post;
      expect(start.requestBody.content["application/json"].schema.$ref).toContain("AuthStartRequest");
      expect(Object.keys(start.responses)).toEqual(
        expect.arrayContaining(["202", "400", "422", "429"]),
      );
      const startRequest = document.components.schemas.AuthStartRequest;
      expect(startRequest.required).toEqual(["email", "driver"]);
      expect(startRequest.properties.email.format).toBe("email");
      expect(startRequest.additionalProperties).toBe(false);

      const verify = document.paths["/v1/auth/verify"].post;
      expect(verify.requestBody.content["application/json"].schema.$ref).toContain("AuthVerifyRequest");
      expect(Object.keys(verify.responses)).toEqual(
        expect.arrayContaining(["201", "400", "422", "429"]),
      );
      expect(verify.responses["201"].content["application/json"].schema.$ref).toContain("CredentialResponse");
      const verifyRequest = document.components.schemas.AuthVerifyRequest;
      expect(verifyRequest.required).toEqual(["email", "code", "driver"]);
      expect(verifyRequest.additionalProperties).toBe(false);
    });

    it("returns warnings first and never a second refresh token by accident", () => {
      const credential = document.components.schemas.CredentialResponse;
      expect(Object.keys(credential.properties)[0]).toBe("warnings");
      expect(credential.required).toContain("warnings");
      expect(credential.required).not.toContain("refresh_token");
    });

    it("describes the 401 challenge, the 403 scope refusal, and the rate limits", () => {
      const put = document.paths["/v1/pages"].put;
      expect(put.responses["401"].headers["WWW-Authenticate"].example).toBe('Bearer realm="strata"');
      expect(put.responses["403"].headers["WWW-Authenticate"].example).toContain('error="insufficient_scope"');
      expect(put.responses["403"].content["application/json"].schema.$ref).toContain("InsufficientScopeError");
      expect(document.paths["/v1/auth/start"].post.responses["429"].headers["Retry-After"]).toBeDefined();
      expect(document.paths["/v1/auth/verify"].post.responses["429"].headers["Retry-After"]).toBeDefined();
      expect(document.paths["/v1/auth/verify"].post.responses["400"].content["application/json"].schema.$ref).toContain("InvalidCodeError");
      expect(document.paths["/v1/auth/refresh"].post.responses["400"].content["application/json"].schema.$ref).toContain("InvalidGrantError");
    });

    it("names the error codes an agent branches on", () => {
      const codeOf = (name: string) =>
        document.components.schemas[name].allOf[1].properties.code.const;
      expect(codeOf("InvalidCodeError")).toBe("invalid_code");
      expect(codeOf("InvalidGrantError")).toBe("invalid_grant");
      expect(codeOf("InsufficientScopeError")).toBe("insufficient_scope");
    });

    /** Published request bodies are compiled from the handlers' schemas; these assert the tie. */
    describe("request bodies say what the handler enforces", () => {
      const ENFORCED = {
        StaticCredentialRequest: StaticAgentBodySchema,
        AuthStartRequest: AuthStartBodySchema,
        AuthVerifyRequest: AuthVerifyBodySchema,
        RefreshRequest: RefreshTokenBodySchema,
        RevokeRequest: RevokeTokenBodySchema,
        SpaceCreateRequest: CreateSpaceBodySchema,
        SpacePatchRequest: UpdateSpaceBodySchema,
        PagePatchRequest: SetPageBodySchema,
      };

      it("publishes exactly the fields each body accepts", () => {
        for (const [name, schema] of Object.entries(ENFORCED)) {
          const published = Object.keys(document.components.schemas[name].properties ?? {});
          expect(published, name).toEqual(Object.keys(schema.shape));
        }
      });

      it("refuses in the document what the handler refuses in the request", () => {
        const slug = document.components.schemas.SpaceCreateRequest.properties.slug;
        const pattern = new RegExp(slug.pattern as unknown as string);
        for (const candidate of ["My Space", "-leading", "Trailing-"]) {
          expect(pattern.test(candidate), candidate).toBe(false);
          expect(
            CreateSpaceBodySchema.safeParse({ slug: candidate, name: "Q3", emoji: "📦" }).success,
            candidate,
          ).toBe(false);
        }
        expect(pattern.test("2026-q3-review")).toBe(true);
      });

      it("leaves the refresh-token-only revoke path open", () => {
        // An agent holding only a refresh token must be able to revoke with it.
        expect(document.components.schemas.RevokeRequest.properties.token).toBeDefined();
        expect(document.components.schemas.RevokeRequest.maxProperties).toBeUndefined();
        expect(RevokeTokenBodySchema.safeParse({ token: "sr_abc" }).success).toBe(true);
      });
    });

    it("is a structurally valid OpenAPI 3.1 document", () => {
      expect(document.openapi).toBe("3.1.1");
      const schemes = new Set(Object.keys(document.components.securitySchemes));
      const operationIds = new Set<unknown>();
      const refs: string[] = [];
      const collect = (node: unknown): void => {
        if (Array.isArray(node)) return void node.forEach(collect);
        if (node === null || typeof node !== "object") return;
        for (const [key, value] of Object.entries(node)) {
          if (key === "$ref" && typeof value === "string") refs.push(value);
          else collect(value);
        }
      };
      collect(document);
      for (const ref of refs) {
        expect(ref.startsWith("#/components/schemas/")).toBe(true);
        expect(document.components.schemas[ref.slice("#/components/schemas/".length)]).toBeDefined();
      }
      for (const [path, item] of Object.entries(document.paths)) {
        for (const [method, operation] of Object.entries(item)) {
          expect(typeof operation.operationId, `${method} ${path}`).toBe("string");
          expect(operationIds.has(operation.operationId)).toBe(false);
          operationIds.add(operation.operationId);
          expect(Object.keys(operation.responses).length, `${method} ${path}`).toBeGreaterThan(0);
          for (const requirement of Object.values(operation.security ?? document.security)) {
            for (const name of Object.keys(requirement)) expect(schemes.has(name)).toBe(true);
          }
          for (const parameter of Object.values(operation.parameters ?? {})) {
            const location = parameter.in as unknown as string;
            const name = parameter.name as unknown as string;
            if (location === "path") expect(path).toContain(`{${name}}`);
          }
        }
      }
    });
  });
});
