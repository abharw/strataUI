// Enforces per-tier first-load JS budgets from Next's route bundle diagnostics. Run after `pnpm build`.
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

interface RouteBundleStat {
  route: string;
  firstLoadUncompressedJsBytes: number;
  firstLoadChunkPaths: string[];
}

interface Tier {
  /** Named in failures. */
  label: string;
  routes: readonly string[];
  maxRawBytes: number;
  maxGzipBytes: number;
  /** Whether a first-load chunk may contain the document renderer. */
  rendererAllowed: boolean;
}

const diagnosticsPath = resolve(".next/diagnostics/route-bundle-stats.json");
const nextRoot = resolve(".next");

const KiB = 1024;

/**
 * Every built route belongs to one tier. Ceilings are the heaviest route's measured first
 * load plus 5%: room for ordinary changes, not a new dependency. Re-measure rather than nudge.
 */
const tiers: readonly Tier[] = [
  {
    // Measured: /share/[key] 1367.7 KiB raw / 394.7 KiB gzip. Chart and breakdown stay deferred.
    label: "document",
    routes: ["/share/[key]", "/pages/[id]", "/share/[key]/pages/[id]"],
    maxRawBytes: 1436 * KiB,
    maxGzipBytes: 414 * KiB,
    rendererAllowed: true,
  },
  {
    // Inventory routes; `/spaces/[id]` renders the same tree as `/home`. Must never carry the
    // document renderer. Measured: 894.8 KiB raw / 272.7 KiB gzip.
    label: "list",
    routes: ["/home", "/spaces/[id]"],
    maxRawBytes: 940 * KiB,
    maxGzipBytes: 286 * KiB,
    rendererAllowed: false,
  },
  {
    // Entry pages and fixtures. Measured: /home/sign-in 507.3 KiB raw / 153.0 KiB gzip.
    label: "entry",
    routes: ["/", "/_not-found", "/home/sign-in", "/dev/fixtures", "/dev/home", "/dev/system"],
    maxRawBytes: 533 * KiB,
    maxGzipBytes: 161 * KiB,
    rendererAllowed: false,
  },
];

/** Strings that identify the document renderer in a built chunk, reported apart from size overruns. */
const RENDERER_MARKERS = ["recharts", "json-render", "embla"] as const;

function formatBytes(bytes: number): string {
  return `${(bytes / KiB).toFixed(1)} KiB`;
}

function loadStats(): RouteBundleStat[] {
  if (!existsSync(diagnosticsPath)) {
    throw new Error(
      `Missing ${diagnosticsPath}. Run \`pnpm build\` first; Next writes route bundle diagnostics after a production build.`,
    );
  }
  const value: unknown = JSON.parse(readFileSync(diagnosticsPath, "utf8"));
  if (!Array.isArray(value)) throw new Error(`${diagnosticsPath} must contain a route-stat array.`);
  return value.map((entry): RouteBundleStat => {
    if (
      typeof entry !== "object" || entry === null
      || typeof (entry as { route?: unknown }).route !== "string"
      || typeof (entry as { firstLoadUncompressedJsBytes?: unknown }).firstLoadUncompressedJsBytes !== "number"
      || !Array.isArray((entry as { firstLoadChunkPaths?: unknown }).firstLoadChunkPaths)
      || !(entry as { firstLoadChunkPaths: unknown[] }).firstLoadChunkPaths.every((path) => typeof path === "string")
    ) {
      throw new Error(`${diagnosticsPath} contains an invalid route bundle record.`);
    }
    return entry as RouteBundleStat;
  });
}

function chunkPath(stat: RouteBundleStat, path: string): string {
  const absolute = resolve(path);
  if (!absolute.startsWith(`${nextRoot}${sep}`)) {
    throw new Error(`Route ${stat.route} references a chunk outside .next: ${path}`);
  }
  if (!existsSync(absolute)) {
    throw new Error(`Route ${stat.route} references a missing chunk: ${path}. Run \`pnpm build\` again.`);
  }
  return absolute;
}

function gzipBytes(stat: RouteBundleStat): number {
  return stat.firstLoadChunkPaths.reduce(
    (total, path) => total + gzipSync(readFileSync(chunkPath(stat, path)), { level: 9 }).byteLength,
    0,
  );
}

function rendererMarkers(stat: RouteBundleStat): string[] {
  const found = new Set<string>();
  for (const path of stat.firstLoadChunkPaths) {
    const source = readFileSync(chunkPath(stat, path), "utf8");
    for (const marker of RENDERER_MARKERS) if (source.includes(marker)) found.add(marker);
  }
  return [...found].sort();
}

const stats = loadStats();
const byRoute = new Map(stats.map((stat) => [stat.route, stat]));
const budgeted = new Set(tiers.flatMap((tier) => tier.routes));

const oversized: string[] = [];
const leaked: string[] = [];
const missing: string[] = [];

for (const tier of tiers) {
  for (const route of tier.routes) {
    const stat = byRoute.get(route);
    if (stat === undefined) {
      missing.push(`${route}: in the ${tier.label} budget but missing from ${diagnosticsPath}`);
      continue;
    }
    const raw = stat.firstLoadUncompressedJsBytes;
    const gzip = gzipBytes(stat);
    const markers = tier.rendererAllowed ? [] : rendererMarkers(stat);
    const passes = raw <= tier.maxRawBytes && gzip <= tier.maxGzipBytes && markers.length === 0;
    console.log(
      `${passes ? "PASS" : "FAIL"} ${route} (${tier.label}): ${formatBytes(raw)} raw, ${formatBytes(gzip)} gzip`,
    );
    if (raw > tier.maxRawBytes || gzip > tier.maxGzipBytes) {
      oversized.push(
        `${route} (${tier.label}): ${formatBytes(raw)} raw (max ${formatBytes(tier.maxRawBytes)}), `
        + `${formatBytes(gzip)} gzip (max ${formatBytes(tier.maxGzipBytes)})`,
      );
    }
    if (markers.length > 0) {
      leaked.push(`${route} (${tier.label}): first load contains ${markers.join(", ")}`);
    }
  }
}

const unbudgeted = stats.map((stat) => stat.route).filter((route) => !budgeted.has(route));

const failures = [
  missing.length === 0 ? null : `Budgeted routes the build did not produce:\n${missing.map((line) => `  - ${line}`).join("\n")}`,
  unbudgeted.length === 0 ? null : `Routes with no budget:\n${unbudgeted.map((route) => `  - ${route}`).join("\n")}\n`
    + "Put each in a tier in this file, on purpose. A route nobody chose a number for is a route nobody is holding to one.",
  leaked.length === 0 ? null : `Document renderer in a first load that should not have it:\n${leaked.map((line) => `  - ${line}`).join("\n")}\n`
    + "This is a boundary, not a diet: find the import and move it behind a document route or a `dynamic()` leaf.",
  oversized.length === 0 ? null : `Route bundle budget exceeded:\n${oversized.map((line) => `  - ${line}`).join("\n")}\n`
    + "Either find the weight, or re-measure the tier and state the new ceiling with its reason in this file.",
].filter((failure): failure is string => failure !== null);

if (failures.length > 0) throw new Error(failures.join("\n\n"));
