"use client";

import { createContext, use, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";

type HeadingDepth = 1 | 2 | 3 | 4;

const SectionHeadingContext = createContext<HeadingDepth>(2);

export function SectionHeadingProvider({
  level,
  children,
}: {
  level: HeadingDepth;
  children: ReactNode;
}) {
  return (
    <SectionHeadingContext.Provider value={level}>
      {children}
    </SectionHeadingContext.Provider>
  );
}

/**
 * A heading owned by a leaf component. Its level comes from section context, so moving the leaf
 * into or out of a section never skips a level.
 */
export function GeneratedHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const level = use(SectionHeadingContext);
  const Heading = (`h${level}` as const);
  return <Heading className={className}>{children}</Heading>;
}

export function Section({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  // Depth comes from context only; the schema allows just `title`, so no prop could carry it.
  const level = use(SectionHeadingContext);
  const childLevel = Math.min(level + 1, 4) as HeadingDepth;
  const Heading = (`h${level}` as const);
  const grouped = title !== undefined;
  const Container = grouped ? "section" : "div";
  const headingSize =
    level === 2
      ? "text-section sm:text-section-wide"
      : level === 3
        ? "text-subheading sm:text-heading"
        : "text-body sm:text-lead";

  return (
    <SectionHeadingContext.Provider value={childLevel}>
      <Container className="min-w-0 font-inherit text-ui text-foreground">
        {grouped ? (
          <Heading
            className={cn(
              "mb-4 px-0.5 font-medium leading-tight tracking-title text-foreground",
              headingSize,
            )}
          >
            {title}
          </Heading>
        ) : null}
        <div
          className={`grid min-w-0 grid-cols-1 [&>*]:min-w-0 ${
            grouped ? "gap-3" : "gap-9 sm:gap-11"
          }`}
        >
          {children}
        </div>
      </Container>
    </SectionHeadingContext.Provider>
  );
}
