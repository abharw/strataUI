// Both names stay null until an agent supplies them; nothing derives one from the email.
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { readNamespaceIdentity } from "./identity";

const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function namespaceWith(values: Partial<typeof schema.namespaces.$inferInsert> = {}) {
  const [row] = await db.insert(schema.namespaces).values(values).returning({ id: schema.namespaces.id });
  namespaceIds.push(row.id);
  return row.id;
}

describe("readNamespaceIdentity", () => {
  it("reads the person's name beside the Strata's, and the address behind both", async () => {
    const id = await namespaceWith({
      workosUserId: `user_${Math.random().toString(36).slice(2, 12)}`,
      email: "ada@example.test",
      displayName: "Ada's Strata",
      personName: "Ada",
    });

    await expect(readNamespaceIdentity(id)).resolves.toEqual({
      displayName: "Ada's Strata",
      personName: "Ada",
      email: "ada@example.test",
    });
  });

  it("answers three nulls for a Strata nobody has named, and null for no Strata", async () => {
    const id = await namespaceWith();
    await expect(readNamespaceIdentity(id)).resolves.toEqual({
      displayName: null,
      personName: null,
      email: null,
    });

    const gone = await namespaceWith();
    await db.delete(schema.namespaces).where(eq(schema.namespaces.id, gone));
    await expect(readNamespaceIdentity(gone)).resolves.toBeNull();
  });
});
