import { Children, isValidElement, type ReactNode } from "react";

import { Collection } from "@/page-content/collection";

/**
 * Grid of compact peers; the `metric` collection tokens set columns, gap and row height. Each
 * child keeps a wrapper that gets the minimum height, which a card inside then fills.
 */
export function Grid({ children }: { children?: ReactNode }) {
  const items = Children.toArray(children);

  return (
    <Collection kind="metric" data-layout="grid">
      {items.map((child, index) => (
        <div key={isValidElement(child) && child.key !== null ? child.key : `grid-item-${index}`}>
          {child}
        </div>
      ))}
    </Collection>
  );
}
