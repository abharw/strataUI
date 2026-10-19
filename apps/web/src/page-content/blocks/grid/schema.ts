/**
 * `grid`: a container for metric, progress and card children. No column, gap or breakpoint
 * props; the renderer owns the layout. The child cap is `MAX_GRID_CHILDREN` in the document schema.
 */
import * as z from "zod";

import { MAX_GRID_CHILDREN } from "@/page-content/document/limits";
import { GRID_CHILD_TYPES } from "@/page-content/document/composition";
import type { ComponentMeta } from "@/page-content/types";

export const schema = z.strictObject({}).describe(
  `no props; children must be ${GRID_CHILD_TYPES.join(", ")} elements, at most ${MAX_GRID_CHILDREN}, arranged in two columns on a phone`,
);

export const meta = {
  name: "grid",
  since: 15,
  shape: "compact values held together",
  readerActs: false,
  description:
    "Scan a few equally important metrics, progress bars, or cards together when their values should remain visible for comparison.",
  interaction:
    "Display-only; values remain together in two phone columns.",
  confusable_with: [
    {
      name: "section",
      note: "grid arranges compact peers together; section groups mixed content in page order.",
    },
    {
      name: "carousel",
      note: "carousel focuses attention on peers through browsing; grid keeps compact values visible together.",
    },
    {
      name: "table",
      note: "grid gives a few values equal prominence; table aligns shared fields for exact comparison.",
    },
    {
      name: "card",
      note: "grid is the container that holds cards (and bare metrics or progress) together; card is the unit it holds.",
    },
  ],
  example: {},
} as const satisfies ComponentMeta;
