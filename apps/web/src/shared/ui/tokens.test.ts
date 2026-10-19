import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The 44px floor must use the `control` token, not the numeric utility that emits the same CSS.
const ROOTS = ["src/features", "src/shared/ui"];
const BANNED = /(?:^|[\s"'`:[])(?:min-)?(?:h|w|size)-11(?![\w.-])/u;

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/u.test(path) && !/\.test\.tsx?$/u.test(path) ? [path] : [];
  });
}

describe("the 44px control floor", () => {
  it("is spelled with the token everywhere product chrome uses it", () => {
    const offenders = ROOTS.flatMap(sources)
      .filter((path) => BANNED.test(readFileSync(path, "utf8")));

    expect(offenders).toEqual([]);
  });
});

// The skip link is suppressed only inside the native shell (its WebView focuses on load), never
// by pointer type, so tablets with keyboards keep it.
describe("the skip link", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

  it("is never hidden from a keyboard because the pointer is a finger", () => {
    expect(css).toContain(".strata-skip-link:focus-visible");
    expect(css).not.toMatch(/any-hover:\s*none/u);
    expect(css).not.toMatch(/@media[^{]*\{\s*\.strata-skip-link,/u);
    expect(css).toContain(':root[data-strata-shell="native"] .strata-skip-link:focus-visible');
  });
});
