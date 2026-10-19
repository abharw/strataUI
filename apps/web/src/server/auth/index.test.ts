import { describe, expect, it, vi } from "vitest";

import { resolveBearerCredential } from "./index";

const NAMESPACE_ID = "00000000-0000-4000-8000-000000000001";
const GRANT_ID = "00000000-0000-4000-8000-000000000003";

/** A verified access token, shaped like `verifyAccessToken` returns one. */
function verified(overrides: { kind?: "writer" | "viewer"; scope?: string } = {}) {
  const kind = overrides.kind ?? "writer";
  return {
    grant: { id: GRANT_ID, namespaceId: NAMESPACE_ID, kind, label: "chatgpt" },
    namespaceId: NAMESPACE_ID,
    scope: overrides.scope ?? "pages:read pages:write namespace:pair",
    kind,
    tokenId: "00000000-0000-4000-8000-000000000004",
    expiresAt: new Date(Date.now() + 3_600_000),
  } as never;
}

describe("grant-backed credentials", () => {
  it("resolves an sw_ token to a writer principal carrying its grant and scope", async () => {
    const result = await resolveBearerCredential(`sw_${"a".repeat(43)}`, {
      verifyCredential: async () => verified(),
    });

    expect(result).toEqual({
      status: "authenticated",
      identity: {
        kind: "writer",
        namespace_id: NAMESPACE_ID,
        grant_id: GRANT_ID,
        scope: ["pages:read", "pages:write", "namespace:pair"],
      },
    });
  });

  it("resolves an sv_ token to a viewer principal that holds only pages:read", async () => {
    const result = await resolveBearerCredential(`sv_${"a".repeat(43)}`, {
      verifyCredential: async () => verified({ kind: "viewer", scope: "pages:read" }),
    });

    expect(result).toMatchObject({
      status: "authenticated",
      identity: { kind: "viewer", grant_id: GRANT_ID, scope: ["pages:read"] },
    });
  });

  it("takes kind from the grant, never from the prefix the caller typed", async () => {
    // Pins that the resolver takes the kind from the grant, not the string.
    const result = await resolveBearerCredential(`sw_${"a".repeat(43)}`, {
      verifyCredential: async () => verified({ kind: "viewer", scope: "pages:read" }),
    });
    expect(result).toMatchObject({ status: "authenticated", identity: { kind: "viewer" } });
  });

  it("is invalid — with no distinguishing detail — when the credential does not verify", async () => {
    for (const token of [`sw_${"a".repeat(43)}`, `sv_${"a".repeat(43)}`]) {
      await expect(resolveBearerCredential(token, { verifyCredential: async () => null }))
        .resolves.toEqual({ status: "invalid" });
    }
  });

  it("refuses an unrecognised prefix without querying anything", async () => {
    const verifyCredential = vi.fn();
    // `sk_` is an unknown prefix that never reaches the database.
    for (const token of [
      `sk_${"a".repeat(43)}`,
      "sr_refresh-token",
      "pgk_page",
      "",
      "Bearer",
    ]) {
      await expect(resolveBearerCredential(token, { verifyCredential }))
        .resolves.toEqual({ status: "invalid" });
    }
    expect(verifyCredential).not.toHaveBeenCalled();
  });
});
