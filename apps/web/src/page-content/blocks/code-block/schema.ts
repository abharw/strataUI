/**
 * `code-block`: exact preformatted text for code, config, terminal output and diffs. Not rich
 * text; whitespace is preserved and nothing executes.
 */
import * as z from "zod";

import type { ComponentMeta } from "@/page-content/types";

/** Keeps one exact-text artifact useful on a phone and within the body cap. */
const MAX_CODE_CHARACTERS = 20_000;

export const schema = z.strictObject({
  code: z
    .string()
    .min(1)
    .max(MAX_CODE_CHARACTERS)
    .refine(
      (code) => !/^\s*(```|~~~)/.test(code),
      "the first line is a Markdown fence - code-block stores exact text, so the fence becomes part of the payload; paste the code itself and set language instead",
    )
    .describe("exact plain text to preserve verbatim; never wrap it in Markdown fences"),
  language: z
    .string()
    .regex(/^[A-Za-z0-9+#._-]{1,32}$/)
    .describe("short language or format label such as ts, json, bash, or text")
    .optional(),
  filename: z.string().min(1).max(160).optional(),
  kind: z
    .enum(["code", "diff"])
    .describe("code for source/config/output; diff when leading + and - lines carry change meaning")
    .optional(),
});

export const meta = {
  name: "code-block",
  since: 4,
  shape: "one exact text artifact",
  readerActs: true,
  description:
    "Preserve exact text for inspection or reuse when whitespace and punctuation are part of its meaning.",
  interaction:
    "Copy the full text or scroll long lines locally; code is never executed.",
  confusable_with: [
    {
      name: "callout",
      note: "callout wraps narrative text; code-block preserves exact whitespace and punctuation for reuse.",
    },
    {
      name: "facts",
      note: "code-block preserves one exact text artifact; facts separates named values and optional copy controls.",
    },
  ],
  example: {
    code: "PUBLIC_BASE_URL=https://strata.example\nPOLL_INTERVAL_MS=3000",
    language: "dotenv",
    filename: ".env.production",
    kind: "code",
  },
} as const satisfies ComponentMeta;
