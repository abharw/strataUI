/**
 * Authorization and refusal guidance. Pure: no database or server. Asserts that `kind` is checked
 * before scope.
 */
import { describe, expect, it } from "vitest";

import type { AuthenticatedIdentity } from "@/server/auth";

import { bearerChallenge, requireScope, requireWriter } from "./auth";

const NAMESPACE_ID = "00000000-0000-4000-8000-0000000000a1";

function principal(overrides: Partial<AuthenticatedIdentity> = {}): AuthenticatedIdentity {
  return {
    kind: "writer",
    namespace_id: NAMESPACE_ID,
    grant_id: "00000000-0000-4000-8000-0000000000a2",
    scope: ["pages:read", "pages:write", "namespace:pair"],
    ...overrides,
  };
}

describe("the bearer challenge", () => {
  it("challenges only a 401", () => {
    expect(bearerChallenge({ status: 401, body: {} }).headers).toEqual({
      "WWW-Authenticate": 'Bearer realm="strata"',
    });
    expect(bearerChallenge({ status: 403, body: {} }).headers).toBeUndefined();
  });
});

describe("requireWriter", () => {
  it("lets a writer through", () => {
    expect(requireWriter(principal())).toBeNull();
  });

  it("refuses a viewer with 403 insufficient_scope and names the scope in the challenge", () => {
    const denied = requireWriter(principal({ kind: "viewer", scope: ["pages:read"] }));
    expect(denied?.status).toBe(403);
    expect(denied?.body.code).toBe("insufficient_scope");
    expect(denied?.headers?.["WWW-Authenticate"]).toBe(
      'Bearer error="insufficient_scope", scope="pages:write"',
    );
  });

  it("refuses a viewer whose scope claims pages:write — kind is not negotiable", () => {
    // Kind is checked before scope, so a viewer carrying a write scope still cannot write.
    const denied = requireWriter(
      principal({ kind: "viewer", scope: ["pages:read", "pages:write"] }),
    );
    expect(denied?.status).toBe(403);
  });

  it("says how to recover rather than only that it refused", () => {
    const denied = requireWriter(principal({ kind: "viewer", scope: ["pages:read"] }));
    expect(String(denied?.body.error)).toMatch(/read-only/i);
    expect(denied?.body.next).not.toHaveLength(0);
  });
});

describe("requireScope", () => {
  it("passes when the principal holds the scope", () => {
    expect(requireScope(principal(), "pages:write")).toBeNull();
    expect(requireScope(principal({ scope: ["pages:read"] }), "pages:read")).toBeNull();
  });

  it("passes every scope a default writer grant carries", () => {
    for (const scope of ["pages:read", "pages:write", "namespace:pair"]) {
      expect(requireScope(principal(), scope)).toBeNull();
    }
  });

  it("refuses a missing scope with 403 and the RFC 6750 challenge naming it", () => {
    const denied = requireScope(principal({ scope: ["pages:read"] }), "namespace:pair");
    expect(denied?.status).toBe(403);
    expect(denied?.body.code).toBe("insufficient_scope");
    expect(denied?.headers?.["WWW-Authenticate"]).toBe(
      'Bearer error="insufficient_scope", scope="namespace:pair"',
    );
  });
});
