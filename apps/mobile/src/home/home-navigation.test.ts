import { describe, expect, it } from "vitest";

import {
  decideHomeNavigation,
  decideHomeNewWindowNavigation,
  shouldReloadHome,
} from "./home-navigation";

const ORIGIN = "https://strata.test";

describe("Home WebView navigation", () => {
  it("contains all same-origin Home routes", () => {
    expect(decideHomeNavigation(ORIGIN, `${ORIGIN}/home`)).toEqual({ kind: "allow" });
    expect(decideHomeNavigation(ORIGIN, `${ORIGIN}/pages/page_123?view=full`))
      .toEqual({ kind: "allow" });
    // Session-gated by cookie, so unclaimed same-origin paths still stay in this WebView.
    expect(decideHomeNavigation(ORIGIN, `${ORIGIN}/home/agents`)).toEqual({ kind: "allow" });
  });

  it("opens web and system destinations outside and blocks active-content schemes", () => {
    expect(decideHomeNavigation(ORIGIN, "https://example.com/reference")).toEqual({
      kind: "external",
      href: "https://example.com/reference",
      transport: "browser",
    });
    expect(decideHomeNavigation(ORIGIN, "mailto:hello@example.com")).toMatchObject({
      kind: "external",
      transport: "system",
    });
    expect(decideHomeNavigation(ORIGIN, "javascript:alert(1)"))
      .toEqual({ kind: "block" });
    expect(decideHomeNavigation(
      ORIGIN,
      `${ORIGIN}/assets/resource_123?expires=123&signature=signed`,
    )).toEqual({
      kind: "external",
      href: `${ORIGIN}/assets/resource_123?expires=123&signature=signed`,
      transport: "browser",
    });
  });

  it("resolves contained new-window targets in-session without widening the policy", () => {
    expect(decideHomeNewWindowNavigation(
      ORIGIN,
      `${ORIGIN}/pages/page_123/assets/report.pdf`,
    )).toEqual({
      kind: "resolve",
      href: `${ORIGIN}/pages/page_123/assets/report.pdf`,
    });
    expect(decideHomeNewWindowNavigation(ORIGIN, "https://example.com/reference"))
      .toEqual({
        kind: "external",
        href: "https://example.com/reference",
        transport: "browser",
      });
    expect(decideHomeNewWindowNavigation(ORIGIN, "tel:+15555550100")).toEqual({
      kind: "external",
      href: "tel:+15555550100",
      transport: "system",
    });
    expect(decideHomeNewWindowNavigation(ORIGIN, "javascript:alert(1)"))
      .toEqual({ kind: "block" });
    expect(decideHomeNewWindowNavigation(ORIGIN, "about:blank"))
      .toEqual({ kind: "block" });
  });
});

describe("session Home recovery", () => {
  it("reloads Home for auth-like failures anywhere under it", () => {
    expect(shouldReloadHome(ORIGIN, `${ORIGIN}/home/`, 401)).toBe(true);
    expect(shouldReloadHome(ORIGIN, `${ORIGIN}/pages/page_123?view=full`, 403))
      .toBe(true);
    expect(shouldReloadHome(ORIGIN, `${ORIGIN}/spaces/space_1`, 403)).toBe(true);
    expect(shouldReloadHome(ORIGIN, `${ORIGIN}/home`, 500)).toBe(false);
    expect(shouldReloadHome(ORIGIN, `${ORIGIN}/pagesomething`, 401)).toBe(false);
    expect(shouldReloadHome(ORIGIN, `${ORIGIN}/homepage`, 401)).toBe(false);
    expect(shouldReloadHome(ORIGIN, "https://evil.example/home", 401)).toBe(false);
  });

  it("leaves a 404 alone: the web app already answers a dead link honestly", () => {
    // A lapsed session redirects rather than 404ing, so a 404 is a real missing page.
    for (const path of ["/home", "/pages/missing", "/spaces/space_1", "/share/pgk_abc"]) {
      expect(shouldReloadHome(ORIGIN, `${ORIGIN}${path}`, 404), path).toBe(false);
    }
  });
});
