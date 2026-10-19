/**
 * Creating and reading grants. Nothing here mints a token; callers create the grant and call
 * `issueTokenPair` in one transaction so no credential exists without its grant.
 */
import { alias } from "drizzle-orm/pg-core";
import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import {
  DEFAULT_WRITER_SCOPES,
  DRIVERS,
  MAX_LABEL_LENGTH,
  SUPPORTED_SCOPES,
  VIEWER_SCOPES,
} from "./config";
import { InvalidRequest, InvalidScope } from "./errors";
import type { Executor, GrantKind, GrantMode, GrantRow } from "./tokens";

export interface CreateGrantInput {
  namespaceId: string;
  kind: GrantKind;
  /** Self-declared by the connecting agent; must be one of `DRIVERS`. */
  driver: string;
  /** Provenance name shown in Home and on "written by". Defaults to `driver`. */
  label?: string;
  mode?: GrantMode;
  /** Ignored for viewers, which are read-only. */
  scope?: readonly string[];
  /** The grant that minted this one; null means the person's own email code did. */
  issuedByGrantId?: string | null;
}

/**
 * Create a grant. A viewer's scope is forced, not validated; a database check constraint repeats
 * the ceiling.
 */
export async function createGrant(
  input: CreateGrantInput,
  options: { db?: Executor; now?: Date } = {},
): Promise<GrantRow> {
  const db = options.db ?? getDb();
  if (!DRIVERS.includes(input.driver as (typeof DRIVERS)[number])) {
    throw new InvalidRequest(`"${input.driver}" is not a driver.`);
  }

  const label = normalizeLabel(input.label, input.driver);
  const scope =
    input.kind === "viewer" ? [...VIEWER_SCOPES] : [...resolveWriterScope(input.scope)];

  const [grant] = await db
    .insert(schema.grants)
    .values({
      namespaceId: input.namespaceId,
      kind: input.kind,
      driver: input.driver,
      label,
      mode: input.mode ?? "rotating",
      scope,
      issuedByGrantId: input.issuedByGrantId ?? null,
      ...(options.now === undefined ? {} : { createdAt: options.now }),
    })
    .returning();
  return grant;
}

/** Collapse whitespace and cap the length; fall back to the driver. */
function normalizeLabel(label: string | undefined, driver: string): string {
  const trimmed = (label ?? "").trim().replace(/\s+/gu, " ");
  return (trimmed === "" ? driver : trimmed).slice(0, MAX_LABEL_LENGTH);
}

function resolveWriterScope(requested: readonly string[] | undefined): readonly string[] {
  if (requested === undefined) return DEFAULT_WRITER_SCOPES;
  const scope = [...new Set(requested)];
  for (const entry of scope) {
    if (!SUPPORTED_SCOPES.includes(entry as (typeof SUPPORTED_SCOPES)[number])) {
      throw new InvalidScope(`"${entry}" is not a scope Strata issues.`);
    }
  }
  if (scope.length === 0) throw new InvalidScope("A writer grant needs at least one scope.");
  return scope;
}

/** A grant plus its issuer's label, resolved in the same query so a list is one round trip. */
export interface GrantListing extends GrantRow {
  /** Label of the issuing grant; null when the person's own code opened this one. */
  issuedByLabel: string | null;
}

/**
 * Every grant on a namespace, newest first, revoked ones included. The issuer is a LEFT JOIN, so
 * a grant opened by the person, or whose issuer was deleted (`set null`), has a null label.
 */
export async function listGrants(
  namespaceId: string,
  options: { db?: Executor } = {},
): Promise<GrantListing[]> {
  const db = options.db ?? getDb();
  const issuer = alias(schema.grants, "issuer");
  const rows = await db
    .select({ grant: schema.grants, issuedByLabel: issuer.label })
    .from(schema.grants)
    .leftJoin(issuer, eq(schema.grants.issuedByGrantId, issuer.id))
    .where(eq(schema.grants.namespaceId, namespaceId))
    .orderBy(desc(schema.grants.createdAt));
  return rows.map((row) => ({ ...row.grant, issuedByLabel: row.issuedByLabel ?? null }));
}

/** One grant by id, or null. The caller checks it belongs to its namespace. */
export async function getGrant(
  id: string,
  options: { db?: Executor } = {},
): Promise<GrantRow | null> {
  const db = options.db ?? getDb();
  const [grant] = await db
    .select()
    .from(schema.grants)
    .where(eq(schema.grants.id, id))
    .limit(1);
  return grant ?? null;
}
