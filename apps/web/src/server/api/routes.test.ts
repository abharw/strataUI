/**
 * Keeps the OpenAPI inventory identical to the `route.ts` files on disk.
 * Pure filesystem and regex; no database or server.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { openApi } from "@/server/api/discovery/openapi";

const WEB_ROOT = join(__dirname, "..", "..", "..");
const ROUTES_DIR = join(WEB_ROOT, "src", "app", "(agent)", "v1");
/**
 * The only REST routes under `/home`: two owner reads. Owner mutations are Server Actions, and the
 * Home UI pages are not walked.
 */
const OWNER_ROUTES_DIR = join(WEB_ROOT, "src", "app", "(owner)", "home");
const OWNER_SUBTREES = ["agents", "search"];

/** The HTTP methods a `route.ts` may export (Next 16 route.js conventions). */
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

interface Route {
  /** `DELETE /v1/spaces/:id` */
  key: string;
  file: string;
}

/** Walk `src/app/(agent)/v1` and read every route file's path and exported methods. */
function routesOnDisk(): Route[] {
  const found: Route[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry !== "route.ts") continue;

      // `src/app/(agent)/v1/spaces/[id]/spec/route.ts` → `/v1/spaces/:id/spec`.
      // Parenthesized folders are Next route groups and are omitted from the URL.
      const segments = relative(join(WEB_ROOT, "src", "app"), dir)
        .split(/[\\/]/)
        .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
        .map((segment) => (segment.startsWith("[") ? `:${segment.slice(1, -1)}` : segment));
      const path = `/${segments.join("/")}`;

      const source = readFileSync(full, "utf8");
      for (const method of METHODS) {
        const exported = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source);
        if (exported) found.push({ key: `${method} ${path}`, file: relative(WEB_ROOT, full) });
      }
    }
  };

  walk(ROUTES_DIR);
  for (const subtree of OWNER_SUBTREES) {
    walk(join(OWNER_ROUTES_DIR, subtree));
  }
  return found;
}

function routesInOpenApi(): string[] {
  const document = openApi("https://strata.test") as {
    paths: Record<string, Record<string, unknown>>;
  };
  const keys: string[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of Object.keys(item)) {
      const upper = method.toUpperCase();
      if (METHODS.includes(upper as (typeof METHODS)[number])) {
        keys.push(`${upper} ${path.replaceAll(/\{([^}]+)\}/g, ":$1")}`);
      }
    }
  }
  return keys.sort();
}

describe("the REST routes on disk", () => {
  const onDisk = routesOnDisk();

  it("finds every route file", () => {
    // Guards against the walker silently finding nothing, which would make the checks vacuous.
    expect(onDisk.length).toBeGreaterThanOrEqual(15);
  });



  it("keeps the OpenAPI operation inventory identical to the live REST routes", () => {
    expect(routesInOpenApi()).toEqual(onDisk.map((route) => route.key).sort());
  });

  /** `/v1` handlers that call `onlyParams(` before `authenticate(`, checked per exported handler. */
  function onlyParamsFirst(): string[] {
    const wrong: string[] = [];
    for (const route of onDisk) {
      if (!route.file.startsWith(join("src", "app", "(agent)", "v1"))) continue;
      const source = readFileSync(join(WEB_ROOT, route.file), "utf8");
      const [method] = route.key.split(" ");
      const body = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b[\\s\\S]*?(?=\\nexport |$)`)
        .exec(source)?.[0];
      if (body === undefined) continue;
      if (!body.includes("authenticate(") || !body.includes("onlyParams(")) continue;
      if (body.indexOf("onlyParams(") < body.indexOf("authenticate(")) wrong.push(`${route.key} (${route.file})`);
    }
    return wrong;
  }

  it("closes the query string on every credentialled /v1 handler", () => {
    // `PUT /v1/assets/:id/bytes` is exempt: it takes no credential, since its signed query string
    // is the capability.
    const open = [...new Set(onDisk
      .map((route) => ({ file: route.file, source: readFileSync(join(WEB_ROOT, route.file), "utf8") }))
      .filter((route) => route.file.startsWith(join("src", "app", "(agent)", "v1")))
      .filter((route) => route.source.includes("authenticate(") && !route.source.includes("onlyParams("))
      .map((route) => route.file))];
    expect(open, "/v1 route files that authenticate but never call onlyParams").toEqual([]);
  });

  it("authenticates before it complains about the query string", () => {
    // Otherwise an anonymous caller gets a 422 that reveals the route exists.
    expect(onlyParamsFirst(), "/v1 handlers that check the query string before the credential").toEqual([]);
  });

  it("covers the complete current REST surface", () => {
    const expected = [
      "POST /v1/spaces",
      "PATCH /v1/spaces/:id",
      "DELETE /v1/spaces/:id",
      "GET /v1/spaces",
      "PUT /v1/pages",
      "PATCH /v1/pages/:id",
      "DELETE /v1/pages/:id",
      "GET /v1/pages",
      "GET /v1/pages/:id",
      "GET /v1/pages/:id/summary",
      "GET /v1/pages/:id/find",
      "POST /v1/assets",
      "GET /v1/assets",
      "PUT /v1/assets/:id/bytes",
      "POST /v1/assets/:id/upload-url",
      "DELETE /v1/assets/:id",
      "GET /v1/manifest",
      "GET /v1/guide",
      "GET /home/agents",
      "GET /home/search",
    ];
    const keys = onDisk.map((route) => route.key);
    expect(expected.filter((key) => !keys.includes(key))).toEqual([]);
  });
});
