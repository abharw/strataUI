import * as z from "zod";

import { ALLOWED_MEDIA_SENTENCE } from "@/shared/assets/policy";
import {
  MAX_ASSET_BYTES,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema, presentation } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";

// Megabytes for the model-facing description text.
const MAX_ASSET_MB = MAX_ASSET_BYTES / (1024 * 1024);

/**
 * Attachments reference uploaded assets, never model-authored URLs: reserve with `POST /v1/assets`,
 * upload, and write the returned `resource_id`. Credit and source_url go on the reservation.
 * `kind`, `media_type` and `size_bytes` are fallback hints; the host's asset record wins.
 */
export const schema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        resource_id: z.string().min(1).max(200).describe(
          `id from POST /v1/assets after uploading the file (${ALLOWED_MEDIA_SENTENCE}; at most ${String(MAX_ASSET_MB)} MB each); credit and source_url belong on the reservation, not on this item`,
        ),
        label: z.string().min(1).max(240).describe("what the reader should call this file"),
        kind: z.enum(["document", "image"]).optional().describe(
          "fallback hint, normally omitted: the asset record named by resource_id already carries the file's type, and the renderer prefers it - send this only so an asset the host cannot resolve yet still renders as the right kind of thing",
        ),
        media_type: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(
            /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i,
            "media_type must be a MIME type such as application/pdf",
          )
          .optional()
          .describe(
            "fallback hint, normally omitted: the host's own MIME type wins wherever the resource resolves",
          ),
        size_bytes: z.number().int().nonnegative().optional().describe(
          "fallback hint, normally omitted: the host's own measured size wins wherever the resource resolves",
        ),
        detail: z.string().min(1).max(240).optional().describe(
          "one line the host cannot know - what the file is for, not what it is",
        ),
      }),
    )
    .describe(`the files belonging to the work; items may be empty only when empty is set${collectionBudgetClause()}`),
  /** Device default: gallery when every item is a host-verified image, list otherwise. */
  presentation: presentation(["list", "gallery"]),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "an attachment-list with no items renders an empty shell - attach the file, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this attachment-list has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "attachment-list",
  since: 2,
  shape: "files belonging to the work",
  readerActs: true,
  description:
    "Present files belonging to the work so the reader can inspect the actual artifact alongside its context.",
  interaction:
    "Preview verified image galleries locally; open available files or originals in another tab.",
  confusable_with: [
    {
      name: "reference-list",
      note: "attachment-list presents host-resolved files belonging to the work; reference-list links to external evidence.",
    },
  ],
  example: {
    items: [
      {
        id: "route-pdf",
        resource_id: "asset_01k33route",
        label: "Race route.pdf",
      },
    ],
  },
} as const satisfies ComponentMeta;
