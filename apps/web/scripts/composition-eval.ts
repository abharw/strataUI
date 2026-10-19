#!/usr/bin/env tsx
/**
 * Scores page specs against the composition corpus.
 *   pnpm eval:composition --golden                      # the hand-authored reference pages
 *   pnpm eval:composition --input candidates.json [--json out.json] [--report out.txt]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  createCompositionEvaluationArtifact,
  formatCompositionEvaluationReport,
} from "../evals/composition/artifacts";
import { COMPOSITION_BRIEFS, GOLDEN_COMPOSITION_CANDIDATES } from "../evals/composition/cases";

interface Arguments {
  candidates: unknown;
  json?: string;
  report?: string;
}

function usage(): string {
  return [
    "Usage: pnpm eval:composition --golden",
    "       pnpm eval:composition --input candidates.json [--json evaluation.json] [--report evaluation.txt]",
    `Input is one JSON object keyed by all ${COMPOSITION_BRIEFS.length} brief ids; each value is a page spec or null.`,
  ].join("\n");
}

function readCandidates(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON input ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArguments(argv: readonly string[]): Arguments {
  let parsed;
  try {
    parsed = parseArgs({
      // `pnpm <script> -- …` forwards the separator; drop it.
      args: argv.filter((arg) => arg !== "--"),
      options: {
        golden: { type: "boolean" },
        input: { type: "string" },
        json: { type: "string" },
        report: { type: "string" },
      },
    });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${usage()}`);
  }
  const { golden, input, json, report } = parsed.values;
  if ((golden === true) === (input !== undefined)) throw new Error(usage());
  return { candidates: golden === true ? GOLDEN_COMPOSITION_CANDIDATES : readCandidates(input!), json, report };
}

function write(pathname: string, contents: string): void {
  mkdirSync(path.dirname(pathname), { recursive: true });
  writeFileSync(pathname, contents, "utf8");
}

function main(argv: readonly string[]): void {
  const args = parseArguments(argv);
  const artifact = createCompositionEvaluationArtifact(args.candidates);
  const humanReport = formatCompositionEvaluationReport(artifact);
  if (args.json !== undefined) write(args.json, `${JSON.stringify(artifact, null, 2)}\n`);
  if (args.report !== undefined) write(args.report, humanReport);
  process.stdout.write(humanReport);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
