import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/ui/cn"

/**
 * `default` is 44px, `action` is 48px to pair with `Button size="action"`. Text stays 16px because
 * iOS Safari zooms on focus below that. Invalid state is a solid border token only.
 */
const inputVariants = cva(
  "w-full min-w-0 rounded-full border border-control-border bg-background px-5 text-body transition-[border-color,box-shadow] duration-100 ease-out outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-control-border-invalid",
  {
    variants: {
      size: {
        default: "h-control",
        action: "h-control-lg",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input }
