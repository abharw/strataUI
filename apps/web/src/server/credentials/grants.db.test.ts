// Grant creation enforces viewer scope, known drivers and readable labels without caller help.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, schema } from "@/server/db";
import { VIEWER_SCOPES } from "./config";
import { InvalidRequest, InvalidScope } from "./errors";
import { createGrant, getGrant, listGrants } from "./grants";

const db = getDb();
let namespaceId: string;

beforeAll(async () => {
  const [namespace] = await db
    .insert(schema.namespaces)
    .values({})
    .returning();
  namespaceId = namespace.id;
});

afterAll(async () => {
  await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespaceId));
});

describe("createGrant", () => {
  it("defaults a writer to the full scope and labels it with its driver", async () => {
    const grant = await createGrant({ namespaceId, kind: "writer", driver: "instinct" });
    expect(grant.label).toBe("instinct");
    expect(grant.mode).toBe("rotating");
    expect(grant.scope).toEqual(["pages:read", "pages:write", "namespace:pair"]);
    expect(grant.revokedAt).toBeNull();
  });

  it("forces a viewer to pages:read however much it asks for", async () => {
    const grant = await createGrant({
      namespaceId,
      kind: "viewer",
      driver: "generic",
      label: "iPhone",
      scope: ["pages:read", "pages:write", "namespace:pair"],
    });
    expect(grant.scope).toEqual([...VIEWER_SCOPES]);
  });

  it("refuses a driver Strata does not label credentials with", async () => {
    await expect(
      createGrant({ namespaceId, kind: "writer", driver: "definitely-not-a-driver" }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });

  it("refuses a scope Strata does not issue", async () => {
    await expect(
      createGrant({ namespaceId, kind: "writer", driver: "instinct", scope: ["pages:delete"] }),
    ).rejects.toBeInstanceOf(InvalidScope);
  });

  it("trims a label to something a list can render", async () => {
    const grant = await createGrant({
      namespaceId,
      kind: "writer",
      driver: "claude-code",
      label: `   ${"n".repeat(80)}   `,
    });
    expect(grant.label).toHaveLength(40);
    expect(grant.label.startsWith("n")).toBe(true);
  });

  it("keeps a static writer's mode on the row", async () => {
    const grant = await createGrant({
      namespaceId,
      kind: "writer",
      driver: "generic",
      mode: "static",
    });
    expect(grant.mode).toBe("static");
  });

});

describe("reading grants", () => {
  it("lists a namespace's grants newest first and finds one by id", async () => {
    const grant = await createGrant({ namespaceId, kind: "writer", driver: "instinct" });
    const listed = await listGrants(namespaceId);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.map((entry) => entry.id)).toContain(grant.id);
    expect(listed[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      listed[listed.length - 1].createdAt.getTime(),
    );

    expect((await getGrant(grant.id))?.id).toBe(grant.id);
    expect(await getGrant(crypto.randomUUID())).toBeNull();
  });
});
