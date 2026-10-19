/** `carousel`: a container that browses `card` children. It has no props. */
import * as z from "zod";

import { MAX_CAROUSEL_CHILDREN } from "@/page-content/document/limits";
import { CAROUSEL_CHILD_TYPES } from "@/page-content/document/composition";
import type { ComponentMeta } from "@/page-content/types";

export const schema = z.strictObject({}).describe(
  `no props; children must be ${CAROUSEL_CHILD_TYPES.join(", ")} elements, at most ${MAX_CAROUSEL_CHILDREN}. The card is the unit browsed one at a time`,
);

export const meta = {
  name: "carousel",
  since: 15,
  shape: "peers browsed one at a time",
  readerActs: true,
  description:
    "Browse self-contained peer cards with focused attention when inspecting each one matters more than seeing the full set together.",
  interaction:
    "Swipe or use arrows to browse locally; other cards may be out of view.",
  confusable_with: [
    {
      name: "grid",
      note: "carousel focuses attention on peers through browsing; grid keeps compact values visible together.",
    },
    {
      name: "section",
      note: "carousel requires horizontal browsing to inspect peers; section keeps related content in page order.",
    },
    {
      name: "card",
      note: "carousel is the container that browses cards one at a time; card is the unit it holds.",
    },
  ],
  // No props, so the example is empty; containment rules live in the schema description.
  example: {},
} as const satisfies ComponentMeta;
