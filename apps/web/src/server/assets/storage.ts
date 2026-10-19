/**
 * Asset byte storage, in Postgres: assets are small and quota-capped, so no second service is
 * needed. Storage keys are random and opaque, so moving to an object store needs no page changes.
 */
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";

export interface AssetStorage {
  put(storageKey: string, bytes: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
}

/** Unguessable, and unrelated to the asset id, the namespace, or the filename. */
export function newStorageKey(): string {
  return randomBytes(24).toString("base64url");
}

const postgresStorage: AssetStorage = {
  async put(storageKey, bytes) {
    await getDb()
      .insert(schema.assetBlobs)
      .values({ storageKey, bytes })
      .onConflictDoUpdate({ target: schema.assetBlobs.storageKey, set: { bytes } });
  },
  async get(storageKey) {
    const [row] = await getDb()
      .select({ bytes: schema.assetBlobs.bytes })
      .from(schema.assetBlobs)
      .where(eq(schema.assetBlobs.storageKey, storageKey));
    return row === undefined ? null : row.bytes;
  },
  async remove(storageKey) {
    await getDb().delete(schema.assetBlobs).where(eq(schema.assetBlobs.storageKey, storageKey));
  },
};

export function storage(): AssetStorage {
  return postgresStorage;
}
