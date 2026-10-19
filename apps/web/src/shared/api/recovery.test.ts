import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidanceIssue } from "@/page-content/authoring/guidance";
import { openApi } from "@/server/api/discovery/openapi";
import { llmsText } from "@/server/api/discovery/llms";
import { authMarkdown } from "@/server/api/discovery/auth-md";
import { RECOVERY, RECOVERY_CODES, RECOVERY_PATHS, documentedRecoveries } from "./recovery";
import { CONTRACT_VERSION } from "./version";
import { fail, ok } from "./types";

// Handler codes are discovered by walking the source tree, so the test holds no second copy of them.

const ROOT = join(process.cwd(), "src");

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/** Zod's own issue code, and the fixture prose that happens to hold `code:`. */
const NOT_AN_ERROR_CODE = new Set(["custom"]);

function declaredCodes(): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of sources(ROOT)) {
    if (path.includes(`${join("page-content", "document", "fixtures")}`)) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/\bcode: "([a-z][a-z0-9_]*)"/g)) {
      const code = match[1];
      if (NOT_AN_ERROR_CODE.has(code)) continue;
      if (!found.has(code)) found.set(code, path);
    }
  }
  return found;
}

/**
 * Authoring-guidance codes reach `fail` through a variable, so the scan cannot see them. The
 * compiler holds this list to the issue type: a missing or extra key fails typecheck.
 */
const GUIDANCE_CODES = Object.keys({
  element_count: true,
  component_monotony: true,
  summary_body_duplication: true,
  literal_markup: true,
  multiple_quotes: true,
  component_choice: true,
  address_drift: true,
} satisfies Record<GuidanceIssue["code"], true>);

describe("the recovery table", () => {
  it("has an entry for every error code any handler produces", () => {
    const missing = [...declaredCodes()]
      .filter(([code]) => !(code in RECOVERY))
      .map(([code, path]) => `${code} (${path.slice(ROOT.length + 1)})`);
    expect(missing).toEqual([]);
  });

  it("has no entry for a code nothing produces", () => {
    const declared = declaredCodes();
    const indirect = new Set(GUIDANCE_CODES);
    const orphans = RECOVERY_CODES.filter((code) => !declared.has(code) && !indirect.has(code));
    expect(orphans).toEqual([]);
  });

  it("sends every recovery to a route that exists", () => {
    const paths = Object.keys((openApi("https://strata.test") as { paths: Record<string, unknown> }).paths);
    expect(RECOVERY_PATHS.filter((path) => !paths.includes(path))).toEqual([]);
  });

  it("names a method the route actually serves", () => {
    const document = openApi("https://strata.test") as {
      paths: Record<string, Record<string, unknown>>;
    };
    const wrong = Object.entries(RECOVERY)
      .filter(([, entry]) => entry.recover !== null)
      .filter(([, entry]) => document.paths[entry.recover!.path]?.[entry.recover!.method.toLowerCase()] === undefined)
      .map(([code, entry]) => `${code}: ${entry.recover!.method} ${entry.recover!.path}`);
    expect(wrong).toEqual([]);
  });

  it("says one thing per field", () => {
    for (const [code, entry] of Object.entries(RECOVERY)) {
      expect(entry.truth, code).not.toBe("");
      expect(entry.truth.trim(), code).toMatch(/[.!]$/);
      if (entry.recover !== null) {
        expect(entry.recover.path, code).toMatch(/^\//);
        expect(entry.recover.then, code).not.toBe("");
      }
    }
  });
});

describe("what a refusal carries", () => {
  it("attaches the table's recovery without a call site asking", () => {
    const body = fail(400, { error: "invalid_grant", code: "invalid_grant", next: ["start_auth"] }).body;
    expect(body.recover).toMatchObject({ method: "POST", path: "/v1/auth/start" });
    expect(body.avoid).toContain("never open a second Strata");
    expect(body.contract_version).toBe(CONTRACT_VERSION);
  });

  it("lets a handler that knows more override the table", () => {
    const body = fail(409, {
      error: "stale",
      code: "version_conflict",
      next: ["get_page"],
      recover: { method: "GET", path: "/v1/pages/abc", then: "read it" },
    }).body;
    expect(body.recover).toMatchObject({ path: "/v1/pages/abc" });
  });

  it("fills error_description from the same sentence the docs print", () => {
    const body = fail(400, { error: "invalid_code", code: "invalid_code", next: ["start_auth"] }).body;
    expect(body.error_description).toBe(RECOVERY.invalid_code.truth);
  });

  it("puts the contract version on a success too", () => {
    expect(ok({ pages: [] }).body.contract_version).toBe(CONTRACT_VERSION);
  });

  it("leaves a code with no entry alone rather than inventing one", () => {
    const body = fail(400, { error: "nope", code: "not_a_real_code", next: ["get_guide"] }).body;
    expect(body.recover).toBeUndefined();
    expect(body.avoid).toBeUndefined();
    expect(body.contract_version).toBe(CONTRACT_VERSION);
  });
});

describe("the documents rendered from it", () => {
  it("gives llms.txt and auth.md something to render", () => {
    expect(documentedRecoveries("llms").length).toBeGreaterThan(5);
    expect(documentedRecoveries("auth").length).toBeGreaterThan(5);
  });

  it("prints the table's own sentences, not a second copy of them", () => {
    const llms = llmsText("https://strata.test");
    const auth = authMarkdown("https://strata.test");
    for (const [code, entry] of documentedRecoveries("llms")) {
      expect(llms, code).toContain(entry.truth);
    }
    for (const [code, entry] of documentedRecoveries("auth")) {
      expect(auth, code).toContain(entry.truth);
    }
  });

  it("tells an agent which contract it just read, by its exact value", () => {
    expect(llmsText("https://strata.test")).toContain(`This is contract \`${CONTRACT_VERSION}\``);
    expect(llmsText("https://strata.test")).toContain("contract_version");
    expect((openApi("https://strata.test") as { info: { version: string } }).info.version)
      .toBe(CONTRACT_VERSION);
  });

  it("keeps auth.md short enough to be read whole", () => {
    // Agents read this before holding a credential, so it must stay short.
    expect(authMarkdown("https://strata.test").split("\n").length).toBeLessThan(100);
  });
});
