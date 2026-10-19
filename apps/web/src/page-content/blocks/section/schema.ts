/**
 * `section`: semantic hierarchy only; layout comes from `grid`. Page-body headings are
 * `section.title`; the root title is app chrome. Children are element ids, not props.
 */
import * as z from "zod";

import type { ComponentMeta } from "@/page-content/types";

export const schema = z.strictObject({
  title: z.string().min(1).optional().describe(
    "optional heading for a nested section; omit on the root section, where app chrome owns the page title",
  ),
});

export const meta = {
  name: "section",
  since: 1,
  shape: "mixed content in page order",
  readerActs: false,
  description:
    "Group related content in page order, using headings for meaningful parts within the page and an untitled section at the root.",
  interaction:
    "Read children in page order; grouping adds no controls or saved state.",
  confusable_with: [
    {
      name: "grid",
      note: "grid arranges compact peers together; section groups mixed content in page order.",
    },
    {
      name: "carousel",
      note: "carousel requires horizontal browsing to inspect peers; section keeps related content in page order.",
    },
    {
      name: "card",
      note: "card is one self-contained unit with slots; section groups any number of mixed children in page order.",
    },
  ],
  example: { title: "This week" },
} as const satisfies ComponentMeta;
