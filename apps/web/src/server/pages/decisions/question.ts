/**
 * Question identity: a hash of the question, context and option labels, not the spec version,
 * so unrelated edits keep it open but changed terms void it. Computed only on the server.
 */
import { createHash } from "node:crypto";

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionShape {
  question: string;
  context?: string;
  options: readonly QuestionOption[];
}

export function questionKey(shape: QuestionShape): string {
  const canonical = JSON.stringify([
    shape.question,
    shape.context ?? null,
    shape.options.map((option) => [option.id, option.label]),
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}
