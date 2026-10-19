import { describe, expect, it } from "vitest";

import { pageLinkUrl, pageViewer, type PageLinkTarget } from "./viewer";

const target: PageLinkTarget = {
  id: "00000000-0000-4000-8000-000000000003",
  spaceId: "00000000-0000-4000-8000-000000000002",
  shared: true,
};

describe("pageLinkUrl", () => {
  it("keeps owner navigation on the canonical address, with no key in it", () => {
    expect(pageLinkUrl(target, {
      kind: "owner-session",
      namespaceId: "00000000-0000-4000-8000-000000000001",
    })).toBe(`/pages/${target.id}`);
  });

  it("never hands another page's key to a page-key holder", () => {
    expect(pageLinkUrl(target, {
      kind: "direct",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      pageKey: "pgk_mine",
    })).toBeNull();
  });

  it("never leaks a private or cross-track page through a bundle", () => {
    const context = {
      kind: "bundle" as const,
      namespaceId: "00000000-0000-4000-8000-000000000001",
      spaceId: target.spaceId,
      bundleKey: "spk_bundle",
    };
    expect(pageLinkUrl({ ...target, shared: false }, context)).toBeNull();
    expect(pageLinkUrl({ ...target, spaceId: "00000000-0000-4000-8000-000000000009" }, context)).toBeNull();
  });

  it("resolves only exposed members to a nested bundle URL", () => {
    expect(pageLinkUrl(target, {
      kind: "bundle",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      spaceId: target.spaceId,
      bundleKey: "spk_bundle",
    })).toBe(`/share/spk_bundle/pages/${target.id}`);
  });
});

describe("pageViewer", () => {
  const page = {
    id: "00000000-0000-4000-8000-000000000003",
    spaceId: "00000000-0000-4000-8000-000000000002",
    spaceName: "Trips",
  };

  it("makes a page-key holder an explicit standalone reader", () => {
    const viewer = pageViewer(page, {
      kind: "direct",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      pageKey: "pgk_mine",
    });
    expect(viewer.kind).toBe("direct");
    expect("space" in viewer).toBe(false);
    // The share link resolves the page on its own: no id in the address.
    expect(viewer.changesUrl).toBe("/share/pgk_mine/changes");
    expect(viewer.changesUrl).not.toContain(page.id);
  });

  it("returns one discriminated chrome variant for each capability", () => {
    const base = { namespaceId: "00000000-0000-4000-8000-000000000001" } as const;
    expect(pageViewer(page, { kind: "owner-session", ...base }).kind).toBe("owner");
    expect(pageViewer(page, { kind: "direct", ...base, pageKey: "pgk_mine" }).kind).toBe("direct");
    expect(
      pageViewer(page, { kind: "bundle", ...base, spaceId: page.spaceId, bundleKey: "spk_b" }).kind,
    ).toBe("bundle");
  });

  it("does not place owner mutation endpoints on a direct viewer", () => {
    const viewer = pageViewer(page, {
      kind: "direct",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      pageKey: "pgk_mine",
    });
    expect(Object.keys(viewer).sort()).toEqual(["changesUrl", "kind", "manageNote"]);
    expect(viewer.manageNote).toBe("To pin or delete this page, open it from Home.");
  });

  it("hands an owner session the page's identity, not a set of endpoints", () => {
    const viewer = pageViewer(page, {
      kind: "owner-session",
      namespaceId: "00000000-0000-4000-8000-000000000001",
    });

    expect(viewer.space).toEqual({ name: "Trips", url: `/spaces/${page.spaceId}` });
    expect(viewer.changesUrl).toBe(`/pages/${page.id}/changes`);
    // Owner actions are Server Actions bound to this id.
    expect(viewer.pageId).toBe(page.id);
    expect(Object.keys(viewer).sort()).toEqual(["changesUrl", "kind", "pageId", "space"]);
    for (const url of [viewer.space.url, viewer.changesUrl]) {
      expect(url).not.toContain("pgk_");
    }
  });

  it("gives a bundle viewer only its shared Space parent", () => {
    const viewer = pageViewer(page, {
      kind: "bundle",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      spaceId: page.spaceId,
      bundleKey: "spk_bundle",
    });
    expect(viewer.space).toEqual({ name: "Trips", url: "/share/spk_bundle" });
    expect("changesUrl" in viewer).toBe(false);
    expect("pageId" in viewer).toBe(false);
  });
});
