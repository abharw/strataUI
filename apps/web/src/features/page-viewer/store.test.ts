import { describe, expect, it, vi } from "vitest";

import { REGISTRY_VERSION } from "@/page-content/catalog-versions";

import { createPageStore } from "./store";
import type { ChangesPayload, PageSnapshot } from "./state";

const seed: PageSnapshot = {
  meta: {
    title: "Trip",
    slug: "trip",
    kind: "living",
    url: "/share/pgk_page-key",
    written_registry_version: REGISTRY_VERSION,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
  space: { name: "Field notes", url: "/spaces/space-field" },
  spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
  version: 1,
  user: { pinned: false },
  shared: false,
  agentUpdating: false,
  updatedAt: "2026-08-01T00:00:00Z",
  recent: [],
  asks: [],
  assets: {},
  ownerName: null,
  writer: null,
  lastSummary: null,
};

const payload = (over: Partial<ChangesPayload>): ChangesPayload => ({
  version: 2,
  registry_version: REGISTRY_VERSION,
  agent_updating: false,
  updated_at: "2026-08-02T00:00:00Z",
  snapshot: {
    spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
    summary: "Updated",
    at: "2026-08-02T00:00:00Z",
  },
  ...over,
});

describe("ingest", () => {
  it("takes a snapshot written under the registry this bundle has", () => {
    const store = createPageStore(seed);
    expect(store.getState().ingest(payload({}))).toBe("ok");
    expect(store.getState().version).toBe(2);
  });

  it("asks for a reload instead of rendering a spec from a different registry", () => {
    // A newer registry may use components this bundle lacks.
    const store = createPageStore(seed);
    expect(store.getState().ingest(payload({ registry_version: REGISTRY_VERSION + 1 }))).toBe("reload");
    expect(store.getState().version).toBe(1);
  });

  it("writes nothing at all when it asks for a reload", () => {
    const store = createPageStore(seed);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().ingest(payload({ registry_version: REGISTRY_VERSION + 1, agent_updating: true }));
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().agentUpdating).toBe(false);
  });

  it("does not reload for a server that sends no registry version", () => {
    const store = createPageStore(seed);
    const unversioned = payload({});
    delete (unversioned as Partial<ChangesPayload>).registry_version;
    expect(store.getState().ingest(unversioned)).toBe("ok");
  });

  it("lands one tick as one write, so no subscriber sees half of it", () => {
    // Separate writes would expose new asks beside the old spec.
    const store = createPageStore(seed);
    const listener = vi.fn(() => {
      const state = store.getState();
      expect(state.asks.length).toBe(1);
      expect(state.version).toBe(2);
    });
    store.subscribe(listener);
    store.getState().ingest(payload({
      asks: [{ approval_id: "spend", ask_seq: 1, question_key: "k1", answer: null }],
      assets: { one: { href: "/assets/one", filename: "one.jpg", media_type: "image/jpeg", size_bytes: 1 } },
      writer: null,
    }));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps the stale list's identity when there was nothing to clear", () => {
    const store = createPageStore(seed);
    const before = store.getState().stale;
    store.getState().ingest(payload({}));
    expect(store.getState().stale).toBe(before);
  });

  it("keeps the asks it has when a tick repeats them word for word", () => {
    const ask = { approval_id: "spend", ask_seq: 1, question_key: "k1", answer: null };
    const store = createPageStore({ ...seed, asks: [ask] });
    const before = store.getState().asks;
    store.getState().ingest(payload({ snapshot: null, asks: [{ ...ask }] }));
    expect(store.getState().asks).toBe(before);
  });
});

describe("the trail of recent changes", () => {
  it("appends oldest-last, so the newest is the last entry", () => {
    const store = createPageStore(seed);
    store.getState().ingest(payload({ version: 2 }));
    store.getState().ingest(payload({
      version: 3,
      snapshot: { spec: seed.spec, summary: "Later", at: "2026-08-03T00:00:00Z" },
    }));
    expect(store.getState().recent.map((change) => change.version)).toEqual([2, 3]);
    expect(store.getState().recent.at(-1)?.summary).toBe("Later");
  });

  it("keeps the last eight, so a tab open all day does not grow without end", () => {
    const store = createPageStore(seed);
    for (let version = 2; version <= 12; version += 1) {
      store.getState().ingest(payload({
        version,
        snapshot: { spec: seed.spec, summary: `Write ${version}`, at: "2026-08-03T00:00:00Z" },
      }));
    }
    expect(store.getState().recent).toHaveLength(8);
    expect(store.getState().recent[0].version).toBe(5);
  });
});

describe("the View steps trail", () => {
  it("is absent until a page asks for it, and a seed may leave it unsaid", () => {
    expect(createPageStore(seed).getState().steps).toBeNull();
    const shown = createPageStore({ ...seed, steps: [{ version: 1, summary: "Created", at: "2026-08-01T00:00:00Z" }] });
    expect(shown.getState().steps).toHaveLength(1);
  });

  it("takes the server's whole trail on a changed tick, files and all", () => {
    const store = createPageStore(seed);
    const trail = [
      { version: 1, summary: "Created", at: "2026-08-01T00:00:00Z" },
      { version: 2, summary: "Updated", at: "2026-08-02T00:00:00Z", assetRefs: ["asset_shot"] },
    ];
    store.getState().ingest(payload({ version: 2, steps: trail }));
    expect(store.getState().steps).toEqual(trail);
    expect(store.getState().recent.map((change) => change.version)).toEqual([2]);
  });

  it("keeps the trail it has across a tick that carries none", () => {
    const trail = [{ version: 1, summary: "Created", at: "2026-08-01T00:00:00Z" }];
    const store = createPageStore({ ...seed, steps: trail });
    store.getState().ingest(payload({ version: 1, snapshot: null }));
    expect(store.getState().steps).toBe(trail);
    const plain = createPageStore(seed);
    plain.getState().ingest(payload({ version: 2 }));
    expect(plain.getState().steps).toBeNull();
  });
});

describe("a page whose address stopped resolving", () => {
  it("starts live: nothing is gone until the poll says the server said so twice", () => {
    expect(createPageStore(seed).getState().gone).toBe(false);
  });

  it("says so once, so a tab that keeps failing does not wake every subscriber", () => {
    const store = createPageStore(seed);
    store.getState().setGone();
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setGone();
    expect(store.getState().gone).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("transport", () => {
  it("says a tab is offline once, not every three seconds", () => {
    const store = createPageStore(seed);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setOffline(true);
    store.getState().setOffline(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("comes back on the first tick that lands", () => {
    const store = createPageStore(seed);
    store.getState().setOffline(true);
    store.getState().ingest(payload({ snapshot: null }));
    expect(store.getState().offline).toBe(false);
  });

  it("holds the reload notice once the skew reload has been spent", () => {
    const store = createPageStore(seed);
    store.getState().setNeedsReload();
    expect(store.getState().needsReload).toBe(true);
  });
});

describe("what rides every tick without moving the version", () => {
  it("takes a rename, a move and a pin the poll carried", () => {
    // None of these writes a spec, so only the poll can deliver them.
    const store = createPageStore(seed);
    store.getState().ingest(payload({
      title: "Trip, revised",
      user: { pinned: true },
      space: { name: "Travel", url: "/spaces/space-travel" },
      snapshot: null,
    }));

    expect(store.getState().meta.title).toBe("Trip, revised");
    expect(store.getState().meta.slug).toBe("trip");
    expect(store.getState().user.pinned).toBe(true);
    expect(store.getState().space).toEqual({ name: "Travel", url: "/spaces/space-travel" });
  });

  it("writes nothing for a tick that repeats what the tab already holds", () => {
    const store = createPageStore(seed);
    const before = store.getState();
    store.getState().ingest(payload({
      title: "Trip",
      user: { pinned: false },
      space: { name: "Field notes", url: "/spaces/space-field" },
      snapshot: null,
    }));

    // Identities are kept so the title subscriber does not re-render.
    expect(store.getState().meta).toBe(before.meta);
    expect(store.getState().space).toBe(before.space);
    expect(store.getState().user).toBe(before.user);
  });

  it("ignores an older server that sends none of them", () => {
    const store = createPageStore(seed);
    store.getState().ingest(payload({ snapshot: null }));
    expect(store.getState().meta.title).toBe("Trip");
    expect(store.getState().user.pinned).toBe(false);
  });

  it("still moves the pin and the exposure from this tab's own menu", () => {
    const store = createPageStore(seed);
    store.getState().setUser({ pinned: true });
    expect(store.getState().user.pinned).toBe(true);
    store.getState().setShared(true);
    expect(store.getState().shared).toBe(true);
    store.getState().setUrl("/share/pgk_rotated");
    expect(store.getState().meta.url).toBe("/share/pgk_rotated");
  });
});

describe("a question that moved on under the reader", () => {
  const ask = {
    approval_id: "spend",
    ask_seq: 1,
    question_key: "k1",
    answer: null,
  };

  it("goes quiet on a refused tap instead of re-arming under the old words", () => {
    // The 409 names the current asking but not its wording, so the buttons wait.
    const store = createPageStore({ ...seed, asks: [ask] });
    expect(store.getState().markStale("spend", "k1")).toBe(true);
    expect(store.getState().stale).toEqual(["spend"]);
  });

  it("takes the new asking in place when the refusal names the same words", () => {
    // A re-ask writes no spec, so a stale mark would never clear.
    const store = createPageStore({ ...seed, asks: [ask] });
    const current = { ...ask, ask_seq: 2 };
    expect(store.getState().markStale("spend", "k1", current)).toBe(false);
    expect(store.getState().stale).toEqual([]);
    expect(store.getState().asks[0].ask_seq).toBe(2);
  });

  it("still goes quiet when the refusal names words the reader has not seen", () => {
    const store = createPageStore({ ...seed, asks: [ask] });
    expect(store.getState().markStale("spend", "k1", { ...ask, ask_seq: 2, question_key: "k2" })).toBe(true);
    expect(store.getState().stale).toEqual(["spend"]);
  });

  it("marks the same question stale once", () => {
    const store = createPageStore({ ...seed, asks: [ask] });
    store.getState().markStale("spend", "k1");
    store.getState().markStale("spend", "k1");
    expect(store.getState().stale).toEqual(["spend"]);
  });

  it("stays quiet through a tick that carries the new asking but no new words", () => {
    const store = createPageStore({ ...seed, asks: [ask] });
    store.getState().markStale("spend", "k1");
    store.getState().ingest(payload({
      snapshot: null,
      asks: [{ ...ask, ask_seq: 2, question_key: "k2" }],
    }));
    expect(store.getState().stale).toEqual(["spend"]);
  });

  it("does not raise a notice when the new wording beat the refusal home", () => {
    // The tick landed first, so the buttons are already live against the new words.
    const store = createPageStore({ ...seed, asks: [ask] });
    store.getState().ingest(payload({ asks: [{ ...ask, ask_seq: 2, question_key: "k2" }] }));
    expect(store.getState().markStale("spend", "k1")).toBe(false);
    expect(store.getState().stale).toEqual([]);
  });

  it("comes back the moment the snapshot with the new wording lands", () => {
    const store = createPageStore({ ...seed, asks: [ask] });
    store.getState().markStale("spend", "k1");
    store.getState().ingest(payload({ asks: [{ ...ask, ask_seq: 2, question_key: "k2" }] }));
    expect(store.getState().stale).toEqual([]);
    expect(store.getState().asks[0].ask_seq).toBe(2);
  });

  it("comes back for the reader's own answer", () => {
    const store = createPageStore({ ...seed, asks: [ask] });
    store.getState().markStale("spend", "k1");
    store.getState().setAnswer({
      ...ask,
      answer: {
        chosen_id: "yes",
        chosen_label: "Yes",
        answered_by: "owner",
        answered_at: "2026-08-02T00:00:00Z",
      },
    });
    expect(store.getState().stale).toEqual([]);
  });
});

describe("file links", () => {
  const live = "/assets/one?expires=999&signature=sig";
  const resource = (href: string) => ({
    href,
    filename: "one.jpg",
    media_type: "image/jpeg",
    size_bytes: 1024,
  });

  it("takes fresh links from a quiet tick, so an open tab never serves a dead one", () => {
    const fresh = resource(live);
    const store = createPageStore({ ...seed, assets: { one: resource("/assets/one?expires=1&signature=old") } });
    store.getState().ingest(payload({ snapshot: null, assets: { one: fresh } }));
    expect(store.getState().assets.one).toBe(fresh);
  });

  it("keeps the links it has when a tick carries none", () => {
    const current = resource(live);
    const store = createPageStore({ ...seed, assets: { one: current } });
    store.getState().ingest(payload({ snapshot: null }));
    expect(store.getState().assets.one).toBe(current);
  });
});
