/**
 * Credential issuing responses, refresh and revoke, and the owner agent list. Plaintext tokens
 * appear once, in the issuing response. `invalid_code` and `invalid_grant` bodies are identical
 * across causes so they cannot be used as a probing oracle.
 */
import * as z from "zod";

import { and, eq, isNull } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import {
  createGrant,
  formatScope,
  getGrant,
  InvalidGrant,
  InvalidRequest,
  issueTokenPair,
  listGrants,
  MAX_LABEL_LENGTH,
  DRIVERS,
  revokeGrant,
  rotateRefreshToken,
  type GrantKind,
  type IssuedTokenPair,
} from "./index";
import { sha256Hex, verifyHash } from "@/server/credentials/keys";
import { RateLimited, reserve, staticMintWindows } from "@/server/credentials/provision/rate-limit";
import { fail, isUuid, ok, type HandlerResult } from "@/shared/api/types";

/* --------------------------------------------------------------- drivers */

// Driver is self-declared and advisory. Checked here so a bad value is a 422, not a 500.
export function isDriver(value: string): boolean {
  return (DRIVERS as readonly string[]).includes(value);
}

/** `grants.label` is capped by a database check; `createGrant` trims to it. */
export const LabelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);
export const GrantModeSchema = z.enum(["rotating", "static"]);

export function invalidDriver(value: string, next: readonly string[]): HandlerResult {
  return fail(422, {
    error: `"${value}" is not a driver Strata knows. A credential is labelled with the agent product holding it.`,
    code: "invalid_driver",
    path: "/driver",
    valid: [...DRIVERS],
    next,
  });
}

/* ------------------------------------------------------- token responses */

/** The grant fields a credential response reads. */
interface IssuedGrant {
  id: string;
  kind: GrantKind;
  label: string;
  scope: readonly string[];
}

export interface CredentialResponseInput {
  namespaceId: string;
  grant: IssuedGrant;
  pair: IssuedTokenPair;
  /** Present on `POST /v1/auth/verify`, so the agent can confirm which Strata. */
  namespaceDisplayName?: string | null;
}

/** The credential response. `warnings` comes first so a model reading the top sees it. */
export function credentialResponse(input: CredentialResponseInput): Record<string, unknown> {
  const body: Record<string, unknown> = { warnings: [] as string[] };
  body.namespace_id = input.namespaceId;
  if (input.namespaceDisplayName !== undefined) {
    body.namespace_display_name = input.namespaceDisplayName;
  }
  body.grant_id = input.grant.id;
  body.label = input.grant.label;
  body.access_token = input.pair.accessToken;
  body.refresh_token = input.pair.refreshToken;
  body.token_type = "Bearer";
  body.expires_in = input.pair.expiresIn;
  body.scope = scopeString(input.grant.scope, input.pair.scope);
  return body;
}

function scopeString(
  grantScope: readonly string[] | null | undefined,
  fallback?: readonly string[],
): string {
  if (grantScope !== null && grantScope !== undefined && grantScope.length > 0) {
    return formatScope(grantScope);
  }
  return formatScope(fallback ?? []);
}

/* -------------------------------------------------------- error bodies */

/** One body for wrong, expired and consumed codes, so a caller cannot probe which codes exist. */
export function invalidCode(next: readonly string[] = ["start_auth"]): HandlerResult {
  return fail(400, {
    error: "invalid_code",
    code: "invalid_code",
    next: [...next],
  });
}

/**
 * Expired, revoked and replayed refresh tokens get one answer. `fail` fills `recover` and
 * `error_description` from `RECOVERY.invalid_grant`, the text `/auth.md` and `/llms.txt` print.
 */
function invalidGrant(): HandlerResult {
  return fail(400, {
    error: "invalid_grant",
    code: "invalid_grant",
    next: ["start_auth"],
  });
}

/**
 * Material without the refresh prefix. Decided before any lookup, so it leaks nothing; it is a
 * client bug, not an ended connection.
 */
function invalidRefreshMaterial(error: InvalidRequest): HandlerResult {
  return fail(400, {
    error: error.message,
    code: "invalid_request",
    next: ["refresh_credential", "start_auth"],
  });
}

/** A 429 with `Retry-After`, built through `fail` so it keeps `contract_version` and recovery. */
function rateLimited(error: RateLimited, next: readonly string[]): HandlerResult {
  const result = fail(429, {
    error: error.message,
    code: "rate_limited",
    next: [...next],
  });
  return {
    ...result,
    headers: { "Retry-After": String(error.retryAfterSeconds) },
    body: {
      ...result.body,
      limit: error.limit,
      resource: error.resource,
      retry_after_seconds: error.retryAfterSeconds,
    },
  };
}

export async function withBudget(
  next: readonly string[],
  run: () => Promise<HandlerResult>,
): Promise<HandlerResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RateLimited) return rateLimited(error, next);
    throw error;
  }
}

/* --------------------------------------------------- refresh and revoke */

export const RefreshTokenBodySchema = z.strictObject({
  refresh_token: z.string().trim().min(1),
});

/**
 * `POST /v1/auth/refresh`. Expired, revoked, unknown and replayed all answer `invalid_grant`, so
 * a thief cannot confirm a stolen token; a replay also revokes the grant.
 */
export async function refresh(input: { refresh_token: string }): Promise<HandlerResult> {
  let pair: IssuedTokenPair;
  try {
    pair = await rotateRefreshToken(input.refresh_token);
  } catch (error) {
    // ReuseDetected extends InvalidGrant on purpose: one wire answer.
    if (error instanceof InvalidGrant) return invalidGrant();
    if (error instanceof InvalidRequest) return invalidRefreshMaterial(error);
    throw error;
  }

  const grant = await getGrant(pair.grantId);
  if (grant === null) return invalidGrant();

  const body = credentialResponse({
    namespaceId: grant.namespaceId,
    grant: { id: grant.id, kind: grant.kind, label: grant.label, scope: grant.scope },
    pair,
  });
  body.next = ["get_manifest", "put_page"];
  return ok(body, 200);
}

export const RevokeTokenBodySchema = z.strictObject({
  /** An access or refresh token. Omit it and the `Authorization` header is used. */
  token: z.string().trim().min(1).optional(),
});

/**
 * `POST /v1/auth/revoke`. Always 200 with an empty body (RFC 7009), so revocation cannot test
 * whether a string is live. Only a live token revokes, so a leaked old one is no kill switch.
 */
export async function revoke(input: { token: string | null }): Promise<HandlerResult> {
  if (input.token !== null) {
    const grantId = await grantIdForToken(input.token);
    if (grantId !== null) await revokeGrant(grantId, "agent");
  }
  return ok({}, 200);
}

/** The grant behind a live access or refresh token, by hash and a confirming `verifyHash`. */
async function grantIdForToken(raw: string, now: Date = new Date()): Promise<string | null> {
  const [row] = await getDb()
    .select({
      grantId: schema.credentialTokens.grantId,
      tokenHash: schema.credentialTokens.tokenHash,
      expiresAt: schema.credentialTokens.expiresAt,
    })
    .from(schema.credentialTokens)
    .where(and(
      eq(schema.credentialTokens.tokenHash, sha256Hex(raw)),
      isNull(schema.credentialTokens.revokedAt),
      isNull(schema.credentialTokens.consumedAt),
    ))
    .limit(1);
  if (row === undefined) return null;
  if (!verifyHash(raw, row.tokenHash)) return null;
  // A null expiry is a static credential.
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return null;
  return row.grantId;
}

/* ---------------------------------------------------------- owner surface */

/** No-store, no-index, no-referrer: every owner response carries the home key. */
const OWNER_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

export function owner(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...OWNER_HEADERS, ...result.headers } };
}

/** The 404 every owner route gives for a home key that resolves to nothing. */
function noSuchHome(): HandlerResult {
  return owner(fail(404, {
    error: "No Strata at that address.",
    code: "not_found",
    next: ["open_home"],
  }));
}

interface AgentSummary {
  grant_id: string;
  kind: GrantKind;
  driver: string;
  label: string;
  mode: string;
  scope: readonly string[];
  /** The grant that let this one in; null means the person's own code did. */
  issued_by_grant_id: string | null;
  /** That grant's label, resolved so the row reads without a second lookup. */
  issued_by_label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/**
 * `GET /home/agents`. Revoked grants stay listed so the person can verify a disconnection. Each
 * row carries `issued_by_label` because one agent can credential another.
 */
export async function listAgents(namespaceId: string): Promise<HandlerResult> {
  const grants = await listGrants(namespaceId);
  return owner(ok({
    agents: grants.map((grant): AgentSummary => ({
      grant_id: grant.id,
      kind: grant.kind,
      driver: grant.driver,
      label: grant.label,
      mode: grant.mode,
      scope: grant.scope,
      issued_by_grant_id: grant.issuedByGrantId,
      issued_by_label: grant.issuedByLabel,
      created_at: grant.createdAt.toISOString(),
      last_used_at: grant.lastUsedAt?.toISOString() ?? null,
      revoked_at: grant.revokedAt?.toISOString() ?? null,
    })),
  }));
}

/** Disconnect one agent. Another namespace's grant is a 404, so grant ids do not leak. */
export async function revokeAgent(
  namespaceId: string,
  grantId: string,
): Promise<HandlerResult> {
  if (!isUuid(grantId)) return noSuchHome();
  const grant = await getGrant(grantId);
  if (grant === null || grant.namespaceId !== namespaceId) return noSuchHome();

  await revokeGrant(grantId, "owner");
  const after = await getGrant(grantId);
  return owner(ok({
    grant_id: grantId,
    revoked_at: after?.revokedAt?.toISOString() ?? new Date().toISOString(),
    revoked_by: after?.revokedBy ?? "owner",
  }));
}

export const StaticAgentBodySchema = z.strictObject({
  driver: z.string(),
  label: LabelSchema.optional(),
});

/**
 * `POST /v1/credentials/static`: a long-lived writer credential for an agent that can only hold a
 * fixed string. No refresh or expiry, so revoking is the only rotation. Metered per namespace.
 */
export async function mintStaticAgent(
  namespaceId: string,
  input: { driver: string; label?: string },
  issuedByGrantId: string,
): Promise<HandlerResult> {
  const next = ["get_manifest", "put_page"];

  if (!isDriver(input.driver)) return invalidDriver(input.driver, next);

  return withBudget(next, async () => {
    // A static credential never expires, so waiting cannot undo a mint.
    await reserve(staticMintWindows(namespaceId));

    // One transaction: a committed grant without a token would show as connected but be unusable.
    const { grant, pair } = await getDb().transaction(async (tx) => {
      const created = await createGrant({
        namespaceId,
        kind: "writer",
        driver: input.driver,
        label: input.label ?? input.driver,
        mode: "static",
        issuedByGrantId,
      }, { db: tx });
      return { grant: created, pair: await issueTokenPair(created, { db: tx }) };
    });

    const body: Record<string, unknown> = { warnings: [] as string[] };
    body.namespace_id = namespaceId;
    // Lets an agent minting for another say which Strata the credential opens.
    body.namespace_display_name = await namespaceDisplayName(namespaceId);
    body.grant_id = grant.id;
    body.label = grant.label;
    body.mode = "static";
    body.access_token = pair.accessToken;
    body.token_type = "Bearer";
    // Present and null so a client that stores keys unconditionally records no expiry.
    body.expires_in = null;
    body.refresh_token = null;
    body.scope = scopeString(grant.scope, pair.scope);
    body.next = next;

    return ok(body, 201);
  });
}

async function namespaceDisplayName(namespaceId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ displayName: schema.namespaces.displayName })
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, namespaceId))
    .limit(1);
  return row?.displayName ?? null;
}
