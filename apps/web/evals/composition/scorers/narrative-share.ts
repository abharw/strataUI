/** Share of visible text that is prose, to catch a source paragraph pasted into components. */
import type { ComponentName } from "../../../src/page-content/catalog";
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief } from "../brief";
import type { NarrativeShareScore } from "../scoring";
import { NARRATIVE_COMPONENTS } from "../taxonomy";
import { pageTextChars, textSpans } from "../../../src/page-content/document/text";
import { round } from "../scoring";

export function narrativeShare(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): NarrativeShareScore {
  if (spec === null) {
    const passed = brief.disposition === "message";
    return {
      score: passed ? 1 : 0,
      passed,
      narrative_chars: 0,
      total_text_chars: 0,
      share: 0,
      maximum: brief.max_narrative_share,
    };
  }
  const total = pageTextChars(spec);
  const narrative = textSpans(spec)
    .filter((span) => NARRATIVE_COMPONENTS.has(span.type as ComponentName))
    .reduce((sum, span) => sum + span.chars, 0);
  const share = total === 0 ? 0 : narrative / total;
  const passed = share <= brief.max_narrative_share;
  const score = passed
    ? 1
    : brief.max_narrative_share === 0
      ? 0
      : brief.max_narrative_share / share;
  return {
    score: round(score),
    passed,
    narrative_chars: narrative,
    total_text_chars: total,
    share: round(share),
    maximum: brief.max_narrative_share,
  };
}
