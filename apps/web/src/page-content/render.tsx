"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";

import { SectionHeadingProvider } from "@/page-content/blocks/section/view";
import { SpecVersionContext } from "./broken-block";
import { UnknownComponent } from "./unknown-component";
import { strataReactRegistry } from "@/page-content/json-render/registry";
import type { StrataSpec } from "./schema";

// Stable identity: upstream compares `initialState` by reference and re-flattens on change.
const EMPTY_STATE = Object.freeze({});

/**
 * Renders a validated spec through JSON Render. No directives are wired in; formatting happens
 * in the host. JSON Render's state, visibility and action layers stay mounted but inert, since
 * stored specs cannot carry those fields. Live page state lives in `PageStore`.
 */
export function PageRenderer({
  spec,
  headingLevel = 2,
  specVersion = 0,
}: {
  spec: StrataSpec;
  headingLevel?: 2 | 3 | 4;
  /** Bumps when a live page swaps in a newer spec, clearing broken blocks. */
  specVersion?: number;
}) {
  const rootIsSection = spec.elements[spec.root]?.type === "section";
  const initialLevel = rootIsSection
    ? (Math.max(1, headingLevel - 1) as 1 | 2 | 3 | 4)
    : headingLevel;
  return (
    <SectionHeadingProvider level={initialLevel}>
      <JSONUIProvider
        registry={strataReactRegistry}
        initialState={EMPTY_STATE}
      >
        <SpecVersionContext.Provider value={specVersion}>
          <Renderer spec={spec} registry={strataReactRegistry} fallback={UnknownComponent} />
        </SpecVersionContext.Provider>
      </JSONUIProvider>
    </SectionHeadingProvider>
  );
}
