/** The patch pre-check on in-memory specs. Database-backed cases are in `index.db.test.ts`. */
import { describe, expect, it } from "vitest";

import type { StrataSpec } from "@/page-content/schema";

import { PatchOpSchema } from "@/server/pages/handlers/schemas";

import { applyOps, touchedApprovals } from "./ops";

function flatSpec(count: number, prefix = "item"): StrataSpec {
  const children = Array.from({ length: count - 1 }, (_, index) => `${prefix}-${index + 1}`);
  const elements: StrataSpec["elements"] = { root: { type: "section", props: {}, children } };
  for (const id of children) {
    elements[id] = { type: "callout", props: { text: id }, children: [] };
  }
  return { root: "root", answer: { verdict: "Spec under test." }, elements };
}

function refusal(result: ReturnType<typeof applyOps>): { status: number; body: Record<string, unknown> } {
  if (!("status" in result)) throw new Error("expected a refusal, got a spec");
  return result;
}

function applied(result: ReturnType<typeof applyOps>): StrataSpec {
  if ("status" in result) throw new Error(`expected a spec, got ${JSON.stringify(result.body)}`);
  return result as StrataSpec;
}

describe("applyOps", () => {
  it("refuses an add past the end of a list and says how to append", () => {
    const result = refusal(applyOps(flatSpec(4), [
      { op: "add", path: "/elements/root/children/9", value: "item-1" },
    ]));
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ code: "invalid_ops", path: "/ops/0", next: ["get_page", "patch_page_spec"] });
    expect(String(result.body.error)).toContain('Use "-" to append');
    expect(String(result.body.error)).toContain("index 9 of a list with 3 items");
  });

  it("measures a move within one list against the list the move shortens", () => {
    // The destination is checked after the source leaves: index 3 is the end, 4 is past it.
    const pastEnd = refusal(applyOps(flatSpec(5), [
      { op: "move", from: "/elements/root/children/0", path: "/elements/root/children/4" },
    ]));
    expect(pastEnd.body.code).toBe("invalid_ops");
    expect(String(pastEnd.body.error)).toContain("once the moved item is taken out of it");

    const toTheEnd = applied(applyOps(flatSpec(5), [
      { op: "move", from: "/elements/root/children/0", path: "/elements/root/children/3" },
    ]));
    expect(toTheEnd.elements.root?.children).toEqual(["item-2", "item-3", "item-4", "item-1"]);
  });

  it("refuses to remove a pointer that is not there instead of silently doing nothing", () => {
    const result = refusal(applyOps(flatSpec(3), [{ op: "remove", path: "/elements/typo-id" }]));
    expect(result.body).toMatchObject({ code: "invalid_ops", path: "/ops/0" });
    expect(String(result.body.error)).toContain("addresses nothing in the current page");
  });

  it("copies by value, so a later edit to the copy leaves the source alone", () => {
    const before = flatSpec(3);
    const after = applied(applyOps(before, [
      { op: "copy", from: "/elements/item-1", path: "/elements/item-copy" },
      { op: "replace", path: "/elements/item-copy/props/text", value: "rewritten" },
    ]));
    expect(after.elements["item-copy"]?.props.text).toBe("rewritten");
    expect(after.elements["item-1"]?.props.text).toBe("item-1");
    // The library patches in place, so the pre-check must work on a clone.
    expect(before.elements["item-copy"]).toBeUndefined();
    expect(before.elements["item-1"]?.props.text).toBe("item-1");
  });
});

describe("prototype pointers", () => {
  const reserved = ["/elements/__proto__/url", "/elements/constructor/prototype/url", "/answer/__proto__"];

  it("are refused by the patch schema, in path and in from", () => {
    for (const path of reserved) {
      expect(PatchOpSchema.safeParse({ op: "add", path, value: "x" }).success, path).toBe(false);
    }
    expect(PatchOpSchema.safeParse({ op: "copy", path: "/elements/item-9", from: "/elements/__proto__" }).success).toBe(false);
  });

  it("treat inherited keys as missing", () => {
    for (const path of ["/elements/toString", "/elements/hasOwnProperty"]) {
      expect(refusal(applyOps(flatSpec(2), [{ op: "remove", path }])).status, path).toBe(422);
    }
  });

  it("are refused by applyOps without touching Object.prototype", () => {
    for (const path of reserved) {
      const result = refusal(applyOps(flatSpec(2), [{ op: "add", path, value: "https://attacker.example" }]));
      expect(result.status).toBe(422);
    }
    expect(({} as Record<string, unknown>).url).toBeUndefined();
  });
});

describe("touchedApprovals", () => {
  const spec: StrataSpec = {
    root: "root",
    answer: { verdict: "The shipping call is open." },
    elements: {
      root: { type: "section", props: {}, children: ["call"] },
      call: {
        type: "approval",
        props: {
          id: "ship",
          question: "Ship it?",
          context: "The release candidate is green.",
          options: [{ id: "yes", label: "Ship" }, { id: "no", label: "Hold" }],
        },
        children: [],
      },
    },
  };

  it("resolves an addressed approval element to the id its answer is filed under", () => {
    const touched = touchedApprovals(spec, [
      { op: "replace", path: "/elements/call/props/question", value: "Ship it today?" },
    ]);
    expect([...touched]).toEqual(["ship"]);
  });

  it("ignores a test, which reads without changing anything", () => {
    const touched = touchedApprovals(spec, [
      { op: "test", path: "/elements/call/props/question", value: "Ship it?" },
    ]);
    expect(touched.size).toBe(0);
  });
});
