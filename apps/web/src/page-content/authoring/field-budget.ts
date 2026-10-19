/**
 * The text-budget sentence agents read in the REST guide and in the display prompt. Every number
 * comes from the limit the write edge enforces, so the copy cannot drift from the schema.
 */
import {
  MAX_APPROVAL_CONTEXT_CHARS,
  MAX_APPROVAL_COPY_CHARS,
  MAX_CALLOUT_CHARS,
  MAX_CHECKLIST_LABEL_CHARS,
  MAX_CHOICE_LABEL_CHARS,
  MAX_CHOICE_QUESTION_CHARS,
  MAX_COLLECTION_TEXT_CHARS,
  MAX_FACTS_LABEL_CHARS,
  MAX_FACTS_VALUE_CHARS,
  MAX_METRIC_VALUE_CHARS,
  MAX_NOTE_CHARS,
  MAX_RATIONALE_CHARS,
  MAX_REFERENCE_SOURCE_CHARS,
  MAX_REFERENCE_TITLE_CHARS,
  MAX_TRADEOFF_CHARS,
  MAX_UNIT_CHARS,
  MAX_VALUE_LABEL_CHARS,
  PAGE_TEXT_BUDGET,
} from "@/page-content/document/limits";

export type FieldBudgetAudience = "guide" | "prompt";

const LIVING = PAGE_TEXT_BUDGET.living.toLocaleString("en-US");
const STANDING = PAGE_TEXT_BUDGET.standing.toLocaleString("en-US");
const REFERENCE_TEXT_COUNTS =
  "a reference-list's titles, sources, and notes are visible text, counted toward the page and collection budgets like any other";

/** Page, collection and per-field text caps, ending with the closing parenthesis of the field list. */
export function fieldBudgetSentence(audience: FieldBudgetAudience): string {
  if (audience === "guide") {
    return `Text is budgeted like structure and refused the same way. A living page may carry ${LIVING} characters of visible text and a standing page ${STANDING}; one collection's items may carry ${MAX_COLLECTION_TEXT_CHARS} between them; and single fields are capped (choice question ${MAX_CHOICE_QUESTION_CHARS}; option label ${MAX_CHOICE_LABEL_CHARS}; approval context ${MAX_APPROVAL_CONTEXT_CHARS}, all authored approval fields ${MAX_APPROVAL_COPY_CHARS} total; decision or approval tradeoff ${MAX_TRADEOFF_CHARS}, decision rationale ${MAX_RATIONALE_CHARS}; facts value ${MAX_FACTS_VALUE_CHARS}, label ${MAX_FACTS_LABEL_CHARS}; checklist label ${MAX_CHECKLIST_LABEL_CHARS}; callout text ${MAX_CALLOUT_CHARS}; timeline/status-list/reference-list note ${MAX_NOTE_CHARS}, reference-list title ${MAX_REFERENCE_TITLE_CHARS} and source ${MAX_REFERENCE_SOURCE_CHARS} - and ${REFERENCE_TEXT_COUNTS}; metric and progress label ${MAX_VALUE_LABEL_CHARS}).`;
  }
  return `Characters are budgeted like nodes, and refused the same way: ${LIVING} characters of visible text on a living page, ${STANDING} on a standing one, ${MAX_COLLECTION_TEXT_CHARS} across any one collection's items, and per-field caps (choice question ${MAX_CHOICE_QUESTION_CHARS}, option label ${MAX_CHOICE_LABEL_CHARS}, approval context ${MAX_APPROVAL_CONTEXT_CHARS}, decision or approval tradeoff ${MAX_TRADEOFF_CHARS} and decision rationale ${MAX_RATIONALE_CHARS}, facts value ${MAX_FACTS_VALUE_CHARS} and label ${MAX_FACTS_LABEL_CHARS}, checklist label ${MAX_CHECKLIST_LABEL_CHARS}, callout text ${MAX_CALLOUT_CHARS}, timeline/status-list/reference-list note ${MAX_NOTE_CHARS} - and ${REFERENCE_TEXT_COUNTS} - metric and progress label ${MAX_VALUE_LABEL_CHARS}, metric string value ${MAX_METRIC_VALUE_CHARS}, and a unit on any typed value ${MAX_UNIT_CHARS}).`;
}
