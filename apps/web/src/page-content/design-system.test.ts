import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cn } from "@/shared/ui/cn";

const root = new URL("../../", import.meta.url);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

describe("design-system contract", () => {
  it("keeps ShadCN generation aligned with the app's owned primitives", () => {
    const config = JSON.parse(readFileSync(new URL("components.json", root), "utf8")) as {
      style: string;
      iconLibrary: string;
      tailwind: { cssVariables: boolean };
    };

    expect(config).toMatchObject({
      style: "radix-nova",
      iconLibrary: "phosphor",
      tailwind: { cssVariables: true },
    });
  });

  it("uses context-free, directly imported Phosphor glyphs across server and client surfaces", () => {
    const sourceRoot = fileURLToPath(new URL("src", root));
    const sources = sourceFiles(sourceRoot).filter((path) => !path.includes(".test."));
    const runtimeBarrels = sources.filter((path) =>
      /from "@phosphor-icons\/react(?:\/ssr)?";/.test(readFileSync(path, "utf8")),
    );

    expect(runtimeBarrels).toEqual([]);
  });

  /** Only the Page viewer composes application chrome with generated blocks. */
  it("keeps application features separate from agent-selectable blocks", () => {
    const featuresRoot = fileURLToPath(new URL("src/features", root));
    const contentRoot = fileURLToPath(new URL("src/page-content", root));
    const featuresImportRendering = sourceFiles(featuresRoot)
      .filter((path) => !path.includes(".test.") && !path.includes("/page-viewer/"))
      .filter((path) => /from "@\/page-content\/(?:blocks|json-render|authoring|render|catalog|schema)(?:[\/\"])/.test(readFileSync(path, "utf8")))
      .map((path) => relative(featuresRoot, path));
    const contentImportsFeatures = sourceFiles(contentRoot)
      .filter((path) => !path.includes(".test."))
      .filter((path) => /from "@\/features\//.test(readFileSync(path, "utf8")))
      .map((path) => relative(contentRoot, path));

    expect(featuresImportRendering).toEqual([]);
    expect(contentImportsFeatures).toEqual([]);
  });

  it("keeps product UI values in CSS tokens instead of TypeScript hex classes", () => {
    const surface = readFileSync(new URL("src/page-content/surface.ts", root), "utf8");
    const product = readFileSync(new URL("src/shared/ui/styles.ts", root), "utf8");

    expect(surface).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(product).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(product).toContain("text-product-muted-foreground");
    expect(product).toContain("border-product-divider-strong");
  });

  it("uses the named type scale instead of one-off exact font sizes", () => {
    const sourceRoot = fileURLToPath(new URL("src", root));
    const bypass = /(?:text-\[[0-9.]+(?:px|rem)\]|\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b)/;
    const offenders = sourceFiles(sourceRoot).filter((path) =>
      !path.includes(".test.") &&
      !path.includes("/shared/ui/primitives/") &&
      bypass.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps generated semantic states on named tokens rather than palette utilities", () => {
    const componentsRoot = fileURLToPath(new URL("src/page-content/blocks", root));
    const palette = /(?:bg|border|ring|text)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-/;
    const offenders = sourceFiles(componentsRoot).filter((path) =>
      !path.includes(".test.") && palette.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the product explicitly light-only", () => {
    const sourceRoot = fileURLToPath(new URL("src", root));
    const globals = readFileSync(new URL("src/app/globals.css", root), "utf8");
    const darkUtilityOffenders = sourceFiles(sourceRoot).filter((path) =>
      !path.includes(".test.") && readFileSync(path, "utf8").includes("dark:"),
    );

    expect(globals).not.toMatch(/(?:^|\s)\.dark(?:\s|\{|,)/m);
    expect(globals).not.toContain("--sidebar-");
    expect(darkUtilityOffenders).toEqual([]);
  });

  it("routes production controls through the shared ShadCN Button primitive", () => {
    const sourceRoot = fileURLToPath(new URL("src", root));
    const offenders = sourceFiles(sourceRoot)
      .filter((path) => !path.includes(".test.") && !path.includes("/shared/ui/primitives/"))
      .filter((path) => /<button(?:\s|>)/.test(readFileSync(path, "utf8")))
      .map((path) => relative(sourceRoot, path));
    const button = readFileSync(new URL("src/shared/ui/primitives/button.tsx", root), "utf8");

    expect(offenders).toEqual([]);
    expect(button).toContain('action:');
    expect(button).not.toMatch(/\b(?:xs|sm|icon-xs|icon-sm):/);
  });

  it("keeps only ShadCN primitives that a product surface actually composes", () => {
    const sourceRoot = fileURLToPath(new URL("src", root));
    const uiRoot = fileURLToPath(new URL("src/shared/ui/primitives", root));
    const sources = sourceFiles(sourceRoot);
    const orphans = sourceFiles(uiRoot)
      .filter((path) => !path.includes(".test."))
      .filter((path) => {
        const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
        const importPath = `@/shared/ui/primitives/${name}`;
        return !sources.some(
          (source) => source !== path && (
            readFileSync(source, "utf8").includes(importPath)
            || (dirname(source) === dirname(path)
              && readFileSync(source, "utf8").includes(`"./${name}"`))
          ),
        );
      })
      .map((path) => relative(uiRoot, path));

    expect(orphans).toEqual([]);
  });

  it("lets semantic radii replace primitive defaults", () => {
    expect(cn("rounded-xl", "rounded-panel")).toBe("rounded-panel");
    expect(
      cn(
        "data-[swipe-direction=down]:rounded-t-xl",
        "data-[swipe-direction=down]:rounded-t-sheet",
      ),
    ).toBe("data-[swipe-direction=down]:rounded-t-sheet");
  });
});
