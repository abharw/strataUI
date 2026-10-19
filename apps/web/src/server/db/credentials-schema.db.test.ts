/** Asserts against the migrated database, since production runs the migrations, not the TS schema. */
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb, schema } from "./index";

const db = getDb();

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute(
    sql`select to_regclass(${`public.${name}`}) is not null as present`,
  );
  return (result.rows[0] as { present: boolean }).present;
}

async function enumValues(name: string): Promise<string[]> {
  const result = await db.execute(
    sql`select enumlabel from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
        where pg_type.typname = ${name} order by enumsortorder`,
  );
  return result.rows.map((row) => (row as { enumlabel: string }).enumlabel);
}

async function columnNames(table: string): Promise<string[]> {
  const result = await db.execute(
    sql`select column_name from information_schema.columns
        where table_schema = 'public' and table_name = ${table} order by column_name`,
  );
  return result.rows.map((row) => (row as { column_name: string }).column_name);
}

describe("migrated credential schema", () => {
  let namespaceId: string | null = null;

  afterAll(async () => {
    if (namespaceId !== null) {
      await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespaceId));
    }
  });

  it("has every table a credential path reads", async () => {
    for (const table of ["grants", "credential_tokens"]) {
      expect(await tableExists(table), table).toBe(true);
    }
  });

  it("declares the credential enums", async () => {
    expect(await enumValues("grant_kind")).toEqual(["writer", "viewer"]);
    expect(await enumValues("grant_mode")).toEqual(["rotating", "static"]);
    expect(await enumValues("grant_revoked_by")).toEqual([
      "owner",
      "agent",
      "reuse_detected",
      "system",
    ]);
    expect(await enumValues("credential_token_kind")).toEqual(["access", "refresh"]);
  });

  it("anchors a namespace to the address behind it", async () => {
    const columns = await columnNames("namespaces");
    expect(columns).toEqual(expect.arrayContaining(["workos_user_id", "email", "person_name"]));
  });

  it("ties an owner session to its namespace, never to an agent credential", async () => {
    const columns = await columnNames("owner_sessions");
    expect(columns).toEqual(expect.arrayContaining(["namespace_id", "session_hash"]));
    // Sessions are minted only by email verification; nothing derives one from a credential.
    expect(columns).not.toContain("grant_id");
  });

  it("identifies an ask by page, approval and sequence", async () => {
    const columns = await columnNames("page_asks");
    // Wording lives in the page spec and, once answered, in decision_log.
    expect(columns).toEqual(
      expect.arrayContaining(["page_id", "approval_id", "ask_seq", "question_key"]),
    );
  });

  it("keeps grant provenance on the write path", async () => {
    expect(await columnNames("pages")).toContain("last_writer_grant_id");
    expect(await columnNames("page_writes")).toContain("grant_id");
    expect(await columnNames("exposure_log")).toContain("grant_id");
  });

  it("refuses a viewer grant that reads more than pages", async () => {
    const [namespace] = await db
      .insert(schema.namespaces)
      .values({})
      .returning();
    namespaceId = namespace.id;

    // The check constraint is the ceiling, even for callers that bypass `createGrant`.
    await expect(
      db.insert(schema.grants).values({
        namespaceId: namespace.id,
        kind: "viewer",
        driver: "generic",
        label: "phone",
        scope: ["pages:read", "pages:write"],
      }),
    ).rejects.toThrow();
  });

  it("refuses a scope outside the three Strata issues", async () => {
    const [namespace] = await db.insert(schema.namespaces).values({}).returning();
    try {
      await expect(
        db.insert(schema.grants).values({
          namespaceId: namespace.id,
          kind: "writer",
          driver: "generic",
          label: "typo",
          scope: ["pages:read", "pages:admin"],
        }),
      ).rejects.toThrow();
      await expect(
        db.insert(schema.grants).values({
          namespaceId: namespace.id,
          kind: "writer",
          driver: "generic",
          label: "writer",
          scope: ["pages:read", "pages:write", "namespace:pair"],
        }),
      ).resolves.toBeDefined();
    } finally {
      await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespace.id));
    }
  });

  it("refuses half an identity: an address with no provider id behind it", async () => {
    await expect(
      db.insert(schema.namespaces).values({ email: "ada@example.test" }),
    ).rejects.toThrow();
    // Neither half is the normal state of an unclaimed namespace.
    const [namespace] = await db.insert(schema.namespaces).values({}).returning();
    await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespace.id));
  });

  it("lets a static credential's token have no expiry", async () => {
    const [namespace] = await db
      .insert(schema.namespaces)
      .values({})
      .returning();
    try {
      const [grant] = await db
        .insert(schema.grants)
        .values({
          namespaceId: namespace.id,
          kind: "writer",
          driver: "generic",
          label: "actions",
          mode: "static",
          scope: ["pages:read", "pages:write"],
        })
        .returning();
      const [token] = await db
        .insert(schema.credentialTokens)
        .values({
          grantId: grant.id,
          kind: "access",
          tokenHash: `test-${crypto.randomUUID()}`,
          familyId: crypto.randomUUID(),
          expiresAt: null,
        })
        .returning();
      expect(token.expiresAt).toBeNull();
    } finally {
      await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespace.id));
    }
  });
});
