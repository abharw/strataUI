import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Registers the custom `text-*` type scale so tailwind-merge does not treat `text-body` as a
 * colour and drop it next to `text-foreground/85`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "title",
            "title-wide",
            "heading",
            "subheading",
            "section",
            "section-wide",
            "lead",
            "body",
            "row",
            "ui",
            "supporting",
            "meta",
            "micro",
            "overline",
            "calendar",
            "landing",
            "landing-wide",
            "mark-xs",
            "mark-sm",
            "mark-md",
          ],
        },
      ],
      rounded: [
        {
          rounded: [
            "contained",
            "control",
            "panel",
            "data-cell",
            "data-key",
            "chart-marker",
          ],
        },
      ],
      "rounded-t": [{ "rounded-t": ["sheet"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
