/**
 * Credential-touching database writes. Each function is one transaction, and rotating a key never
 * touches any other key. Plaintext secrets exist only in return values and are never logged.
 */
import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { MAX_SPACES_PER_NAMESPACE } from "@/page-content/document/limits";
import {
  generateSecret,
  hasKeyPrefix,
  pageUrl,
  sha256Hex,
  spaceUrl,
} from "@/server/credentials/keys";
import { openKey, sealKey, UrlKeyError } from "@/server/credentials/keys/at-rest";
import { isSingleEmoji } from "@/server/spaces/emoji";

/** The key kinds `POST /v1/keys/rotate` accepts. */
type KeyScope = "page" | "space";

/* ------------------------------------------------------------------ errors */

/** Failure codes; the route layer maps them to the HTTP error body. */
export type ProvisionErrorCode =
  | "quota_exceeded"
  /** The namespace / space / page named by an id does not exist. */
  | "not_found";

export class ProvisionError extends Error {
  constructor(
    readonly code: ProvisionErrorCode,
    message?: string,
    readonly detail?: { limit?: number; resource?: string; retryAfterSeconds?: number },
  ) {
    super(message ?? code);
    this.name = "ProvisionError";
  }
}

/* ----------------------------------------------------------- provisioning */

export interface CreateNamespaceInput {
  /** What to call the person this Strata is for. Optional, settable later. */
  displayName?: string;
}

export interface CreateNamespaceResult {
  namespace_id: string;
}

/**
 * Provision a namespace. Called the first time someone verifies an email code; ownership is the
 * verified `workos_user_id`, so there is no key to return. Namespaces are never swept, since an
 * empty one is still a person's account, sessions and consent log.
 */
export async function createNamespace(
  input: CreateNamespaceInput = {},
): Promise<CreateNamespaceResult> {
  return createNamespaceIn(getDb(), input);
}

/** The same act inside a transaction the caller already opened. */
export async function createNamespaceIn(
  tx: Tx | ReturnType<typeof getDb>,
  input: CreateNamespaceInput = {},
): Promise<CreateNamespaceResult> {
  const [namespace] = await tx
    .insert(schema.namespaces)
    .values({ displayName: input.displayName ?? null })
    .returning({ id: schema.namespaces.id });

  return { namespace_id: namespace.id };
}

/* ----------------------------------------------------------------- spaces */

export interface CreateSpaceResult {
  space_id: string;
  slug: string;
  name: string;
  emoji: string;
  /** Null on create: a space has no URL until `shareSpace` mints its key. */
  share_key: null;
}

/**
 * Serialize lifecycle changes in one namespace. Every path locks namespace, then Space rows, then
 * Page rows. Coarse on purpose: lifecycle writes are rare and one lock order cannot deadlock.
 */
export async function lockNamespaceForLifecycle(tx: Tx, namespaceId: string): Promise<boolean> {
  const [namespace] = await tx
    .select({ id: schema.namespaces.id })
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, namespaceId))
    .for("update");
  return namespace !== undefined;
}

/** Create a Space inside a transaction whose caller may add more atomic work. */
export async function createSpaceIn(
  tx: Tx,
  namespaceId: string,
  { slug, name, emoji }: { slug: string; name: string; emoji: string },
): Promise<CreateSpaceResult> {
  if (!isSingleEmoji(emoji)) {
    throw new TypeError("Space emoji must be exactly one complete Unicode emoji.");
  }
  if (!await lockNamespaceForLifecycle(tx, namespaceId)) {
    throw new ProvisionError("not_found");
  }
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.spaces)
    .where(eq(schema.spaces.namespaceId, namespaceId));
  if (count >= MAX_SPACES_PER_NAMESPACE) {
    throw new ProvisionError("quota_exceeded", `This namespace already has ${MAX_SPACES_PER_NAMESPACE} spaces.`, {
      limit: MAX_SPACES_PER_NAMESPACE,
      resource: "spaces",
    });
  }
  const [space] = await tx
    .insert(schema.spaces)
    .values({ namespaceId, slug, name, emoji })
    .returning({ id: schema.spaces.id, slug: schema.spaces.slug, name: schema.spaces.name, emoji: schema.spaces.emoji });

  return { space_id: space.id, slug: space.slug, name: space.name, emoji: space.emoji, share_key: null };
}

/** `create_space({name})`. A new space is never default and never shared. */
export async function createSpace(
  namespaceId: string,
  { slug, name, emoji }: { slug: string; name: string; emoji: string },
): Promise<CreateSpaceResult> {
  const db = getDb();
  return db.transaction((tx) => createSpaceIn(tx, namespaceId, { slug, name, emoji }));
}

export interface ShareSpaceResult {
  space_id: string;
  /** Plaintext space key returned to the initiating caller. */
  share_key: string;
  /** Stable `/share/:key` URL, also sealed at rest for the owner to copy again. */
  space_url: string;
}

/**
 * Ensure a space has a share key and return its URL. Idempotent; replacing the key is `rotateKey`'s
 * job. Each page's `shared` flag decides what the bundle exposes.
 *
 * @throws ProvisionError('not_found')
 */
export async function shareSpace(
  spaceId: string,
  { baseUrl }: { baseUrl: string },
): Promise<ShareSpaceResult> {
  const db = getDb();
  return db.transaction((tx) => shareSpaceIn(tx, spaceId, { baseUrl }));
}

/**
 * `shareSpace` inside the caller's transaction. A caller holding the space row lock must use this;
 * opening a second connection would wait on its own lock and deadlock.
 *
 * @throws ProvisionError('not_found' | 'default_space_not_shareable')
 */
export async function shareSpaceIn(
  tx: Tx,
  spaceId: string,
  { baseUrl }: { baseUrl: string },
): Promise<ShareSpaceResult> {
  const [space] = await tx
    .select({
      id: schema.spaces.id,
      shareKeyHash: schema.spaces.shareKeyHash,
      sealedShareKey: schema.spaces.sealedShareKey,
    })
    .from(schema.spaces)
    .where(eq(schema.spaces.id, spaceId))
    .for("update");

  if (!space) throw new ProvisionError("not_found");
  if (space.shareKeyHash !== null) {
    if (space.sealedShareKey === null) {
      throw new UrlKeyError("This Space has a shared-key hash but no recoverable share key.");
    }
    const shareKey = openKey(space.sealedShareKey);
    if (!hasKeyPrefix(shareKey, "space")) {
      throw new UrlKeyError("The stored Space capability is not a Space share key.");
    }
    // Re-addressed against this request's origin, so a preview-era share returns a production link.
    return { space_id: space.id, share_key: shareKey, space_url: spaceUrl(baseUrl, shareKey) };
  }

  const shareKey = generateSecret("space");
  const url = spaceUrl(baseUrl, shareKey);
  const now = new Date();

  await tx
    .update(schema.spaces)
    .set({
      shareKeyHash: sha256Hex(shareKey),
      sealedShareKey: sealKey(shareKey),
      sharedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.spaces.id, spaceId));

  return {
    space_id: space.id,
    share_key: shareKey,
    space_url: url,
  };
}

/* --------------------------------------------------------------- rotation */

export interface RotateKeyInput {
  scope: KeyScope;
  id: string;
  baseUrl: string;
  /**
   * Tenancy for Home actions. Checked in the same transaction that replaces the key, so there is
   * no window in which the id could name another namespace's page.
   */
  namespaceId?: string;
}

export interface RotateKeyResult {
  scope: KeyScope;
  id: string;
  /** Plaintext new key, shown once. */
  key: string;
  /** New server-minted URL, so the agent can re-send it. */
  url: string;
}

/**
 * `POST /v1/keys/rotate {scope, id}`. The old key dies immediately, with no grace window, since a
 * read key is rotated because it leaked. Each branch writes one column of one row.
 *
 * @throws ProvisionError('not_found') - no such row in this namespace, or, for
 * a Space, no share link on it to replace.
 */
export async function rotateKey({
  scope,
  id,
  baseUrl,
  namespaceId,
}: RotateKeyInput): Promise<RotateKeyResult> {
  const db = getDb();

  return db.transaction(async (tx): Promise<RotateKeyResult> => {
    switch (scope) {
      case "page": {
        const [page] = await tx
          .select({ id: schema.pages.id })
          .from(schema.pages)
          .where(namespaceId === undefined
            ? eq(schema.pages.id, id)
            : and(eq(schema.pages.id, id), eq(schema.pages.namespaceId, namespaceId)))
          .for("update");
        if (!page) throw new ProvisionError("not_found");

        const key = generateSecret("page");
        const url = pageUrl(baseUrl, key);

        await tx
          .update(schema.pages)
          .set({
            readKeyHash: sha256Hex(key),
            sealedReadKey: sealKey(key),
          })
          .where(eq(schema.pages.id, page.id));

        return { scope, id: page.id, key, url };
      }

      case "space": {
        const [space] = await tx
          .select({ id: schema.spaces.id, shareKeyHash: schema.spaces.shareKeyHash })
          .from(schema.spaces)
          .where(namespaceId === undefined
            ? eq(schema.spaces.id, id)
            : and(eq(schema.spaces.id, id), eq(schema.spaces.namespaceId, namespaceId)))
          .for("update");
        // Rotation replaces a link, never mints one: minting would share a Space the owner never
        // chose to expose.
        if (!space || space.shareKeyHash === null) throw new ProvisionError("not_found");
        const key = generateSecret("space");
        const url = spaceUrl(baseUrl, key);
        const now = new Date();
        await tx
          .update(schema.spaces)
          .set({
            shareKeyHash: sha256Hex(key),
            sealedShareKey: sealKey(key),
            sharedAt: now,
            updatedAt: now,
          })
          .where(eq(schema.spaces.id, id));
        return { scope, id: space.id, key, url };
      }

    }
  });
}

/* ---------------------------------------------------------------- helpers */

/** A drizzle transaction handle, as handed to a `db.transaction` callback. */
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
