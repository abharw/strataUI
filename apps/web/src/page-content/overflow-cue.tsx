"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type ScrollState = { overflowing: boolean; more: boolean; thumb: number; offset: number };

/** Both cues from one measurement. Exported for tests. */
export function scrollState({
  scrollLeft,
  clientWidth,
  scrollWidth,
}: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): ScrollState {
  const overflowing = scrollWidth - clientWidth > 1;
  return {
    overflowing,
    more: scrollLeft + clientWidth < scrollWidth - 1,
    thumb: overflowing ? (clientWidth / scrollWidth) * 100 : 100,
    offset: overflowing ? (scrollLeft / scrollWidth) * 100 : 0,
  };
}

/** Live overflow measurement shared by every horizontal scroller (tables, chart data, code). */
export function useHorizontalOverflow<T extends HTMLElement>() {
  const scroller = useRef<T>(null);
  const [scroll, setScroll] = useState<ScrollState>({
    overflowing: false,
    more: false,
    thumb: 0,
    offset: 0,
  });
  const hintId = useId();

  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    setScroll(scrollState(node));
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    // Observe the content too: it can grow while the container's width stays the same.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const content = node.firstElementChild;
    if (content !== null) observer.observe(content);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  return {
    ref: scroller,
    scroll,
    hintId,
    // Only reference the hint while there is something to scroll to.
    describedBy: scroll.overflowing ? hintId : undefined,
  };
}

/**
 * A trailing-edge hairline while more content remains, and a hint with a track while it
 * overflows. Render as the scroller's sibling inside a `relative` box.
 */
export function ScrollCue({
  state,
  hint,
  hintId,
}: {
  state: ScrollState;
  hint: string;
  hintId?: string;
}) {
  return (
    <>
      {state.more ? (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-30 w-px bg-foreground/20" />
      ) : null}
      {state.overflowing ? (
        <div className="px-4 pb-3 pt-2">
          <p id={hintId} className="mb-1.5 text-micro leading-4 text-muted-foreground">
            {hint}
          </p>
          <div aria-hidden className="h-1 w-full rounded-full bg-border">
            <div
              className="h-1 rounded-full bg-muted-foreground/60"
              style={{ width: `${state.thumb}%`, marginLeft: `${state.offset}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
