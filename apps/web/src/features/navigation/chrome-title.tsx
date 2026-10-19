import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/shared/ui/cn";

// Its own module so client error boundaries can render the title without the imports in
// `layout.tsx`.
const chromeTitleClass =
  "min-w-0 break-words text-balance text-title font-bold tracking-title text-foreground sm:text-title-wide";

/** The shared title for Home, Space and document chrome. */
export function ChromeTitle({
  as: Title = "h1",
  children,
  className,
  ...props
}: {
  as?: "h1" | "h2";
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"h1">, "className" | "children">) {
  return <Title {...props} className={cn(chromeTitleClass, className)}>{children}</Title>;
}
