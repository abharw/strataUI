/**
 * Walks the import graph from the two reader-facing client entries and fails if a value import
 * pulls in Zod or the authoring catalog. `dynamic()` and `"use server"` modules are boundaries.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** `import type` erases at build time; every other import shape is a runtime edge. */
const VALUE_IMPORT = /^import\s+(?!type\s)[\s\S]*?from\s+"([^"]+)"/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*"([^"]+)"\s*\)/g;
const USE_SERVER = /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["'];/;

function resolveModule(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(sourceRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** `follow: "static"` stops at `dynamic()` imports, approximating first-load bundle contents. */
function clientGraph(entry: string, follow: "all" | "static" = "all"): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (graph.has(file)) continue;

    const source = readFileSync(file, "utf8");
    // A `"use server"` module ships as an action reference; its imports never reach the client.
    if (USE_SERVER.test(source)) {
      graph.set(file, []);
      continue;
    }
    const specifiers = [
      ...source.matchAll(VALUE_IMPORT),
      ...(follow === "all" ? source.matchAll(DYNAMIC_IMPORT) : []),
    ].map((match) => match[1]);
    graph.set(file, specifiers);

    for (const specifier of specifiers) {
      const resolved = resolveModule(specifier, file);
      if (resolved !== null) queue.push(resolved);
    }
  }

  return graph;
}

const CLIENT_ENTRIES = ["page-content/render.tsx", "features/page-viewer/page.tsx"] as const;

describe("the client document graph", () => {
  const named = (path: string) => relative(sourceRoot, path);
  const graphs = new Map(
    CLIENT_ENTRIES.map((entry) => [entry, clientGraph(join(sourceRoot, entry))]),
  );
  const firstLoad = new Map(
    CLIENT_ENTRIES.map((entry) => [entry, clientGraph(join(sourceRoot, entry), "static")]),
  );

  it("reaches every catalog component", () => {
    const graph = graphs.get("page-content/render.tsx") as Map<string, string[]>;
    expect(graph.size).toBeGreaterThan(23);
    expect([...graph.keys()].map(named)).toContain("page-content/blocks/table/view.tsx");
    expect([...graph.keys()].map(named)).toContain("page-content/blocks/chart/view.tsx");
  });

  it.each(CLIENT_ENTRIES)("carries no Zod runtime from %s", (entry) => {
    const offenders = [...(graphs.get(entry) as Map<string, string[]>)]
      .filter(([, specifiers]) => specifiers.some((name) => name === "zod" || name.startsWith("zod/")))
      .map(([file]) => named(file));

    expect(offenders).toEqual([]);
  });

  // A static import of a `dynamic()`-split leaf anywhere puts it back in first load.
  it.each(CLIENT_ENTRIES)("reaches no dynamically-split leaf statically from %s", (entry) => {
    const split = [
      "page-content/blocks/attachment-list/view.tsx",
      "page-content/blocks/carousel/view.tsx",
      "page-content/blocks/chart/view.tsx",
      "page-content/blocks/breakdown/view.tsx",
    ];
    const reached = [...(firstLoad.get(entry) as Map<string, string[]>).keys()]
      .map(named)
      .filter((file) => split.includes(file));

    expect(reached).toEqual([]);
  });

  it.each(CLIENT_ENTRIES)(
    "carries neither the catalog value nor the component definitions from %s",
    (entry) => {
      const authoring = [
        "page-content/json-render/catalog.ts",
        "page-content/catalog.ts",
        "page-content/authoring/prompt.ts",
        "page-content/authoring/manifest.ts",
      ];
      const reached = [...(graphs.get(entry) as Map<string, string[]>).keys()]
        .map(named)
        .filter((file) => authoring.includes(file));

      expect(reached).toEqual([]);
    },
  );
});
