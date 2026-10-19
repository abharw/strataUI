/**
 * `GET /v1/manifest[?components=chart,table]`: the catalog generated from renderer prop schemas,
 * with `registry_version`. A pure projection of the registry; no database.
 */
import { COMPONENT_NAMES, isComponentName, type ComponentName } from "@/page-content/catalog";
import { generateManifest } from "@/page-content/authoring/manifest";
import { withEtag } from "@/server/api/http/etag";
import { fail, ok, type HandlerResult } from "@/shared/api/types";

export interface GetManifestInput {
  /** Comma-separated closed component names. Omit for the complete catalog. */
  components?: string;
}

/**
 * The full manifest, or only the requested components. `section` is always included (every spec has
 * a section root), and manifest order is kept so equivalent queries return identical bytes.
 */
export function get(input: GetManifestInput = {}): HandlerResult {
  const manifest = generateManifest();
  if (input.components === undefined) return withEtag(ok({ ...manifest }));

  const requested = input.components.split(",").map((name) => name.trim());
  const invalid = [...new Set(requested.filter((name) => name === "" || !isComponentName(name)))];
  if (invalid.length > 0) {
    const names = invalid.map((name) => name === "" ? "an empty name" : `"${name}"`);
    // Wrong names are usually outdated ones (`section-text` for `callout`); `closest` makes the
    // retry mechanical.
    const closest = nearestComponent(invalid.find((name) => name !== ""));
    return fail(422, {
      error: `components must be a comma-separated list from the current catalog; got ${names.join(", ")}.`,
      code: "unknown_component",
      path: "/components",
      valid: COMPONENT_NAMES,
      ...(closest === undefined ? {} : { closest }),
      next: ["get_manifest", "get_guide"],
    });
  }

  const selected = new Set<ComponentName>(requested.filter(isComponentName));
  selected.add("section");
  return withEtag(ok({
    ...manifest,
    components: manifest.components.filter((component) =>
      isComponentName(component.name) && selected.has(component.name)
    ),
  }));
}

/* ---------------------------------------------------------------- closest */

/**
 * The nearest catalog name by Levenshtein distance, or none when nothing is close, since a wrong
 * suggestion costs the agent a turn.
 */
export function nearestComponent(name: string | undefined): string | undefined {
  if (name === undefined || name === "") return undefined;
  const target = name.toLowerCase();
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of COMPONENT_NAMES) {
    const distance = editDistance(target, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // Half the name's length, clamped to 2..6: "section-text" reaches "section"; nonsense reaches nothing.
  const ceiling = Math.min(6, Math.max(2, Math.floor(target.length / 2)));
  return bestDistance <= ceiling ? best : undefined;
}

/** Levenshtein distance, two rows at a time. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length];
}
