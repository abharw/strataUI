import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as tables from "./schema";
import {
  credentialTokens,
  exposureLog,
  grants,
  namespaces,
  pages,
  pageWrites,
  spaces,
} from "./schema";

describe("database schema", () => {
  /** Pins the table count, so adding or removing a table is an explicit change. */
  it("has the sixteen tables", () => {
    const declared = Object.values(tables).filter((value) => is(value, PgTable));
    expect(declared).toHaveLength(16);
  });

  it("requires a semantic emoji without a database fallback", () => {
    const spaceConfig = getTableConfig(spaces);
    const emoji = spaceConfig.columns.find((column) => column.name === "emoji");
    expect(emoji).toMatchObject({ notNull: true, default: undefined });
  });

  /** `/share/:pgk` carries no page id, so the share key needs a unique index to be the lookup. */
  it("indexes the page share key, because it is now the whole address", () => {
    const { indexes } = getTableConfig(pages);
    const readKey = indexes.find((index) => index.config.name === "pages_read_key_hash_idx");
    expect(readKey?.config.unique).toBe(true);
    expect(readKey?.config.columns.map((column) => (column as { name: string }).name))
      .toEqual(["read_key_hash"]);
  });

  it("declares the pages parent key as a composite unique constraint", () => {
    const spaceConfig = getTableConfig(spaces);
    const pageConfig = getTableConfig(pages);

    expect(
      spaceConfig.uniqueConstraints.map((constraint) => ({
        name: constraint.name,
        columns: constraint.columns.map((column) => column.name),
      })),
    ).toContainEqual({
      name: "spaces_id_namespace_id_unique",
      columns: ["id", "namespace_id"],
    });

    const foreignKey = pageConfig.foreignKeys.find(
      (candidate) => candidate.getName() === "pages_space_id_namespace_id_spaces_id_namespace_id_fk",
    );
    expect(foreignKey?.reference().foreignColumns.map((column) => column.name)).toEqual([
      "id",
      "namespace_id",
    ]);
  });

  it("anchors a namespace to its credentials and nothing an agent can send", () => {
    const namespaceColumns = getTableConfig(namespaces).columns.map((column) => column.name);
    // Identity is a verified email behind `workos_user_id`; there are no accounts or organisations.
    expect(namespaceColumns).toEqual(expect.arrayContaining(["workos_user_id", "email"]));
    expect(namespaceColumns).not.toContain("owner_user_id");
    expect(namespaceColumns).not.toContain("workos_organization_id");
    expect(getTableConfig(grants).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["namespace_id", "kind", "driver", "label", "mode", "scope"]),
    );
  });

  it("renders provenance from the grant, and from nothing else", () => {
    const pageColumns = getTableConfig(pages).columns.map((column) => column.name);
    expect(pageColumns).toContain("last_writer_grant_id");
    // The grant is the only provenance key.
    expect(pageColumns).not.toContain("last_writer_token_id");
    expect(pageColumns).not.toContain("last_writer_workos_agent_registration_id");
    for (const table of [pageWrites, exposureLog]) {
      const columns = getTableConfig(table).columns.map((column) => column.name);
      expect(columns).toContain("grant_id");
      expect(columns).not.toContain("token_id");
      expect(columns).not.toContain("workos_agent_registration_id");
    }
  });

  it("keeps every credential hash-only", () => {
    expect(getTableConfig(credentialTokens).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["token_hash", "family_id", "parent_id", "consumed_at", "revoked_at"]),
    );
    for (const column of getTableConfig(credentialTokens).columns) {
      // A column named for a credential must be a hash or a ciphertext of one.
      expect(column.name).not.toMatch(/^(token|code|secret|idempotency_key|response)$/u);
    }
  });

  it("lets a static credential live without an expiry", () => {
    const expiresAt = getTableConfig(credentialTokens).columns.find(
      (column) => column.name === "expires_at",
    );
    expect(expiresAt?.notNull).toBe(false);
  });

  it("indexes what a resource server reads on every request", () => {
    const tokenConfig = getTableConfig(credentialTokens);
    expect(tokenConfig.columns.find((column) => column.name === "token_hash"))
      .toMatchObject({ isUnique: true });
    expect(tokenConfig.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "credential_tokens_grant_id_kind_idx",
        "credential_tokens_family_id_idx",
        "credential_tokens_expires_at_idx",
      ]),
    );
    expect(getTableConfig(grants).indexes.map((entry) => entry.config.name)).toContain(
      "grants_namespace_id_revoked_at_idx",
    );
  });
});
