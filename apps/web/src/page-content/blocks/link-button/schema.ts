/**
 * `link-button`: navigation to an http(s) `url` or a `page_id`. Exactly one is required, enforced
 * by a Zod refinement because Anthropic's strict schema subset forbids `oneOf`. The agent holds no
 * read keys, so the server resolves `page_id` to the keyed URL at render time.
 */
import * as z from "zod";

import { PageIdSchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";

export const schema = z
  .strictObject({
    label: z.string().min(1).describe("what opening the destination does; at most one link-button per page"),
    /** An external destination. http/https only, so `javascript:` and `data:` URLs never render. */
    url: z
      .url({ protocol: /^https?$/ })
      .describe("http(s) URL of an external destination; send exactly one of url or page_id")
      .optional(),
    /** Another page in this namespace, by id. The server resolves the keyed URL. */
    page_id: PageIdSchema
      .describe(
        "id of another page to link to; the server resolves its keyed URL, so never paste one, and send exactly one of url or page_id",
      )
      .optional(),
  })
  .refine(
    (props) => (props.url === undefined) !== (props.page_id === undefined),
    { message: "give exactly one of url or page_id" },
  );

export const meta = {
  name: "link-button",
  since: 1,
  shape: "one prominent next destination",
  readerActs: true,
  description:
    "Make the reader's main next destination prominent, whether it is an external service or another Strata page.",
  interaction:
    "Open an external link in another tab, or navigate to an accessible Strata page.",
  confusable_with: [
    {
      name: "reference-list",
      note: "link-button makes one next destination prominent; reference-list keeps supporting source links quiet.",
    },
  ],
  example: {
    label: "TAP check-in",
    url: "https://example.com/tap/check-in/ABC123",
  },
} as const satisfies ComponentMeta;
