import * as React from "react"

import { cn } from "@/shared/ui/cn"

const VIEW_BOX = 100
const STROKE_WIDTH = 10
const RADIUS = (VIEW_BOX - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Server-rendered ring gauge for a value out of 100, sized by `size-*` on `className`. Slots
 * `ring-track` and `ring-indicator` are overridable. Exposed as `role="img"` with `label`.
 */
function Ring({
  className,
  value,
  label,
  ...props
}: Omit<React.ComponentProps<"svg">, "children"> & {
  value: number
  label: string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  const offset = CIRCUMFERENCE * (1 - clamped / 100)

  return (
    <svg
      data-slot="ring"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      className={cn("size-24 -rotate-90 text-border", className)}
      {...props}
    >
      <circle
        data-slot="ring-track"
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
      />
      <circle
        data-slot="ring-indicator"
        className="text-foreground transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

export { Ring }
