/**
 * Registry types. `meta` is written for the authoring model; `confusable_with` exists because
 * confusable neighbours, not catalog size, drive misselection.
 */
import type { z } from "zod";

/** A component a model might pick by mistake, and one line telling them apart. */
export interface ConfusablePair {
  readonly name: string;
  readonly note: string;
}

export interface ComponentMeta {
  /** Matches the directory name and the element `type`. */
  readonly name: string;
  /** Registry version that introduced the component (see `catalog-versions.ts`). */
  readonly since: number;
  /** Short data-shape phrase ("one value", "parts of a whole"), listed first in the prompt. */
  readonly shape: string;
  /** When to use this component, addressed to the model. */
  readonly description: string;
  /** What readers can do, distinguishing local controls from saved answers. */
  readonly interaction: string;
  /**
   * True when readers can act (expand, swipe, copy, answer). The compact prompt prints the
   * Reader line only for these; the manifest always carries `interaction`.
   */
  readonly readerActs: boolean;
  readonly confusable_with: readonly ConfusablePair[];
  /** A minimal valid props object. */
  readonly example: Readonly<Record<string, unknown>>;
}

export interface ComponentDefinition {
  readonly schema: z.ZodType;
  readonly meta: ComponentMeta;
}

/** `path` keeps Zod's raw segments from the props root so the API edge can build a JSON Pointer. */
export interface ValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** `issues` is empty iff `ok`. */
export interface PropsValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}
