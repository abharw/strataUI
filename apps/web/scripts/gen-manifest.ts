/**
 * Regenerates the committed manifest and authoring prompt after a schema change, so
 * `manifest.test.ts` passes and the change shows up as a diff. Usage: `pnpm gen:manifest`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { strataCatalog } from "../src/page-content/json-render/catalog";
import { serializeManifest } from "../src/page-content/authoring/manifest";

const here = dirname(fileURLToPath(import.meta.url));
const generated = join(here, "..", "src", "page-content", "authoring", "__generated__");
const target = join(generated, "manifest.json");
const promptTarget = join(generated, "authoring-prompt.txt");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, serializeManifest(), "utf8");
writeFileSync(promptTarget, `${strataCatalog.prompt()}\n`, "utf8");

process.stdout.write(`wrote ${target}\n`);
process.stdout.write(`wrote ${promptTarget}\n`);
