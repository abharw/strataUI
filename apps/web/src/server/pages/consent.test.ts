/** The re-share consent rule as a truth table. */
import { describe, expect, it } from "vitest";

import { exposureUpdate, reshareNeedsUser, type ExposureState, type ReshareAttempt } from "./consent";

const unsharedByUser: ExposureState = { shared: false, exposureActor: "user" };

describe("reshareNeedsUser", () => {
  it("stops an agent re-sharing a page the user unshared", () => {
    expect(reshareNeedsUser(unsharedByUser, { shared: true, actor: "agent" })).toBe(true);
  });

  it("ignores an agent's claim that the user asked", () => {
    const claimed = { shared: true, actor: "agent", on_behalf_of_user: true } as ReshareAttempt;
    expect(reshareNeedsUser(unsharedByUser, claimed)).toBe(true);
  });

  it("does not bind the user on their own surface", () => {
    expect(reshareNeedsUser(unsharedByUser, { shared: true, actor: "user" })).toBe(false);
  });

  it("does not bind an agent re-sharing a page it unshared itself", () => {
    expect(reshareNeedsUser({ shared: false, exposureActor: "agent" }, { shared: true, actor: "agent" })).toBe(false);
  });

  it("does not bind a page that is still shared", () => {
    expect(reshareNeedsUser({ shared: true, exposureActor: "user" }, { shared: true, actor: "agent" })).toBe(false);
  });

  it("does not bind unsharing, moving, or renaming", () => {
    expect(reshareNeedsUser(unsharedByUser, { actor: "agent" })).toBe(false);
    expect(reshareNeedsUser(unsharedByUser, { shared: false, actor: "agent" })).toBe(false);
  });
});

describe("exposureUpdate", () => {
  const now = new Date("2026-08-25T12:00:00Z");

  it("restamps the actor only when the shared bit changes", () => {
    // A move must keep exposureActor, or move-then-reshare would bypass reshareNeedsUser.
    expect(exposureUpdate({ moved: true, requestedShared: undefined, page: { shared: false }, actor: "agent", now })).toBeNull();
    expect(exposureUpdate({ moved: false, requestedShared: undefined, page: { shared: true }, actor: "agent", now })).toBeNull();
  });

  it("stamps the actor on share and unshare", () => {
    expect(exposureUpdate({ moved: false, requestedShared: true, page: { shared: false }, actor: "user", now }))
      .toEqual({ shared: true, sharedAt: now, exposureActor: "user", exposureUpdatedAt: now });
    expect(exposureUpdate({ moved: false, requestedShared: false, page: { shared: true }, actor: "agent", now }))
      .toEqual({ shared: false, sharedAt: null, exposureActor: "agent", exposureUpdatedAt: now });
  });

  it("a move off a shared page is an unshare and restamps", () => {
    expect(exposureUpdate({ moved: true, requestedShared: undefined, page: { shared: true }, actor: "agent", now }))
      .toEqual({ shared: false, sharedAt: null, exposureActor: "agent", exposureUpdatedAt: now });
  });
});
