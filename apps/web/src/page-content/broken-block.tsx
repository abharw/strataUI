"use client";

import React, { Suspense, use } from "react";

/** Version of the rendered spec, so a failed block can reset when new props arrive. */
export const SpecVersionContext = React.createContext(0);

/** Clears the error on a new spec version. A free function so tests can call it directly. */
export function brokenBlockNextState(
  props: { specVersion: number },
  state: { broken: boolean; specVersion: number },
): { broken: boolean; specVersion: number } | null {
  if (props.specVersion === state.specVersion) return null;
  return { broken: false, specVersion: props.specVersion };
}

/**
 * Shows a placeholder when a block throws; JSON Render's own boundary renders nothing. No retry
 * button, since the same props would throw again.
 */
class BrokenBlockBoundary extends React.Component<
  { type: string; specVersion: number; children: React.ReactNode },
  { broken: boolean; specVersion: number }
> {
  constructor(props: { type: string; specVersion: number; children: React.ReactNode }) {
    super(props);
    this.state = { broken: false, specVersion: props.specVersion };
  }

  static getDerivedStateFromError(): { broken: boolean } {
    return { broken: true };
  }

  static getDerivedStateFromProps = brokenBlockNextState;

  componentDidCatch(error: Error): void {
    console.error(`[strata] ${this.props.type} failed to render:`, error);
  }

  render(): React.ReactNode {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="w-full rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 text-supporting text-muted-foreground">
        This part of the page couldn&rsquo;t be shown. It should come back the next
        time the page is written.
        <span className="sr-only"> Failed component: {this.props.type}.</span>
      </div>
    );
  }
}

/**
 * Error boundaries do not run during SSR. Under Suspense, React streams the fallback for a failed
 * subtree and retries on the client, where the boundary catches; per block, not per page.
 */
export function BrokenBlock({ type, children }: { type: string; children: React.ReactNode }) {
  const specVersion = use(SpecVersionContext);
  return (
    <BrokenBlockBoundary type={type} specVersion={specVersion}>
      <Suspense fallback={null}>{children}</Suspense>
    </BrokenBlockBoundary>
  );
}

