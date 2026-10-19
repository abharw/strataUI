import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COLLECTION_TOKENS,
  collectionAttrs,
  collectionCount,
  collectionFrame,
  type CollectionKind,
} from "./collection";

const root = new URL("../../", import.meta.url);
const componentsRoot = fileURLToPath(new URL("src/page-content/blocks", root));
const globals = readFileSync(new URL("src/app/globals.css", root), "utf8");

const KINDS: CollectionKind[] = ["metric", "tile", "choice", "cell"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

/** Grids that lay out one thing's parts rather than N peers, so they are not collections. */
const NOT_COLLECTIONS: Record<string, string> = {
  "section/view.tsx":
    "single-column document flow: the children are unlike each other, and the one column is the point",
  "callout/view.tsx": "an icon gutter beside prose, sized to the icon",
  "streak-grid/view.tsx":
    "the weekday-label gutter beside the calendar scroller; the day cells inside it are a collection and use the primitive",
};

describe("the collection primitive", () => {
  it("is the only thing in the catalog that writes column rules", () => {
    const offenders = sourceFiles(componentsRoot)
      .filter((path) => !path.includes(".test."))
      .filter((path) => /grid-cols-|auto-fit/.test(readFileSync(path, "utf8")))
      .map((path) => relative(componentsRoot, path))
      .filter((path) => !(path in NOT_COLLECTIONS));

    expect(offenders).toEqual([]);
  });

  it("keeps every allowed exception a real file with a real reason", () => {
    for (const [path, reason] of Object.entries(NOT_COLLECTIONS)) {
      const source = readFileSync(join(componentsRoot, path), "utf8");
      expect(/grid-cols-|auto-fit/.test(source), `${path} no longer needs its exception`).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("resolves a kind to the container attribute the stylesheet reads", () => {
    expect(collectionAttrs("metric")).toEqual({ "data-collection": "metric" });
    expect(collectionAttrs("choice")).toEqual({ "data-collection": "choice" });
    expect(collectionAttrs("cell")).toEqual({ "data-collection": "cell" });
  });

  it("buckets a count-driven kind and leaves the others count-blind", () => {
    expect(collectionCount(1)).toBe("1");
    expect(collectionCount(2)).toBe("2");
    expect(collectionCount(3)).toBe("many");
    expect(collectionCount(12)).toBe("many");

    expect(collectionAttrs("tile", 1)).toEqual({ "data-collection": "tile", "data-count": "1" });
    expect(collectionAttrs("tile", 2)).toEqual({ "data-collection": "tile", "data-count": "2" });
    expect(collectionAttrs("tile", 9)).toEqual({ "data-collection": "tile", "data-count": "many" });

    expect(collectionAttrs("metric", 6)).toEqual({ "data-collection": "metric" });
    expect(collectionAttrs("choice", 4)).toEqual({ "data-collection": "choice" });
    // Without a count, tiles get no `data-count`.
    expect(collectionAttrs("tile")).toEqual({ "data-collection": "tile" });
  });

  it("gives every kind a rule and every declared token a value", () => {
    for (const kind of KINDS) {
      expect(globals, `no rule for [data-collection="${kind}"]`)
        .toContain(`[data-collection="${kind}"]`);
      for (const token of COLLECTION_TOKENS[kind]) {
        expect(globals, `${token} is not declared`).toMatch(
          new RegExp(`^\\s*${token}:\\s*[^;]+;`, "m"),
        );
        expect(globals, `${token} is declared but never read`).toContain(`var(${token})`);
      }
    }
  });

  it("declares its tokens once, inside a @theme block", () => {
    const theme = globals.slice(globals.indexOf("@theme static {"));
    const block = theme.slice(0, theme.indexOf("\n}"));

    for (const token of KINDS.flatMap((kind) => COLLECTION_TOKENS[kind])) {
      expect(block, `${token} is declared outside the theme block`).toContain(`${token}:`);
      expect(globals.match(new RegExp(`${token}:`, "g"))?.length).toBe(1);
    }
  });

  it("hangs the tile aspect on the container rather than on each tile", () => {
    expect(globals).toContain(`.${collectionFrame} {`);
    expect(globals).toMatch(/\.strata-collection-frame \{\s*aspect-ratio: var\(--collection-aspect\);/);
    expect(globals).toContain('[data-collection="tile"][data-count="1"]');
    expect(globals).toContain('[data-collection="tile"][data-count="2"]');
    expect(globals).toContain('[data-collection="tile"][data-count="many"]');
  });
});
