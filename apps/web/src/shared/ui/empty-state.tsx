import type { ReactNode } from "react";

import type { AppIconData as Icon } from "./app-icon";
import { AppIcon } from "./app-icon";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/primitives/empty";
import { cn } from "./cn";

import { productTextMuted } from "./styles";

/**
 * Empty states. `row` is one muted line inside an existing list, with no icon or horizontal
 * padding (wrap it in an `<li>` inside a `<ul>`). `screen` fills a whole surface with an icon
 * and an optional action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "row",
  className,
}: {
  icon?: Icon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  size?: "row" | "screen";
  className?: string;
}) {
  if (size === "row") {
    // `icon` and `action` are ignored for rows.
    return (
      <div className={cn("min-h-control py-2.5 text-body leading-6", productTextMuted, className)}>
        {title}
        {description ? (
          <p className="mt-1 text-supporting leading-5">{description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Empty className={cn("py-10 sm:py-14", className)}>
      <EmptyHeader className="max-w-md">
        {icon ? (
          <EmptyMedia variant="icon" className="size-12 rounded-full">
            <AppIcon icon={icon} className="size-5" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-body font-medium">{title}</EmptyTitle>
        {description ? (
          <EmptyDescription className={cn("max-w-md", productTextMuted)}>
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
