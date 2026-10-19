/**
 * Serializes a page to Markdown for the "copy for LLM" control: title, answer, then elements in
 * reading order. Unknown element types fall back to their children.
 */
import type { StrataSpec } from "@/page-content/schema";

export interface PageMarkdownInput {
  title: string;
  spec: StrataSpec;
  /** ISO-8601 write time, emitted verbatim. */
  updatedAt: string;
  /** Reader's URL, included as provenance. */
  url?: string | null;
}

type Element = {
  type: string;
  props: Record<string, unknown>;
  children: string[];
};

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.value === "number" || typeof object.value === "string") {
      return typeof object.unit === "string" && object.unit !== ""
        ? `${object.value} ${object.unit}`
        : String(object.value);
    }
    if (typeof object.amount === "number" && typeof object.currency === "string") {
      return `${object.amount} ${object.currency}`;
    }
  }
  // Not a display shape; fall back to JSON.
  return JSON.stringify(value) ?? "";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Escapes pipes and newlines, which would break a Markdown table row. */
function cell(value: unknown): string {
  return display(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function list(items: unknown): Record<string, unknown>[] {
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

export function pageToMarkdown({ title, spec, updatedAt, url }: PageMarkdownInput): string {
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  const blank = () => {
    if (out.at(-1) !== "") out.push("");
  };

  const walk = (id: string, depth: number) => {
    const element: Element | undefined = spec.elements[id];
    if (element === undefined) return;
    const p = element.props;
    const kids = () => element.children.forEach((child) => walk(child, depth + 1));

    switch (element.type) {
      case "section": {
        const heading = text(p.title);
        if (heading !== null) {
          blank();
          push(`${"#".repeat(Math.min(depth, 6))} ${heading}`, "");
          kids();
        } else {
          // Untitled sections do not add a heading level.
          element.children.forEach((child) => walk(child, depth));
        }
        blank();
        return;
      }
      case "grid":
      case "carousel": {
        // Layout containers are flattened.
        element.children.forEach((child) => walk(child, depth));
        blank();
        return;
      }
      case "card": {
        const title = text(p.title);
        if (title !== null) push(`**${title}**`, "");
        const description = text(p.description);
        if (description !== null) push(description, "");
        kids();
        const footer = text(p.footer);
        if (footer !== null) push(`_${footer}_`);
        blank();
        return;
      }
      case "prose": {
        const body = text(p.text);
        if (body !== null) push(body, "");
        return;
      }
      case "metric": {
        push(`- **${text(p.label) ?? "Metric"}:** ${display(p.value)}`);
        return;
      }
      case "status-list": {
        for (const item of list(p.items)) {
          const label = text(item.label) ?? "";
          const status = text(item.status);
          const owner = text(item.owner);
          const note = text(item.note);
          const due = text(item.due_at);
          let line = `- **${label}**`;
          if (status !== null) line += ` — ${status}`;
          if (owner !== null) line += ` (${owner})`;
          if (due !== null) line += ` · due ${due}`;
          if (note !== null) line += ` — ${note}`;
          push(line);
        }
        blank();
        return;
      }
      case "table": {
        const columns = Array.isArray(p.columns) ? (p.columns as unknown[]).map(display) : [];
        if (columns.length > 0) {
          push(`| ${columns.map(cell).join(" | ")} |`);
          push(`| ${columns.map(() => "---").join(" | ")} |`);
          for (const row of list(p.rows)) {
            const cells = Array.isArray(row.cells) ? (row.cells as unknown[]) : [];
            push(`| ${cells.map(cell).join(" | ")} |`);
          }
          blank();
        }
        return;
      }
      case "facts": {
        for (const item of list(p.items)) {
          push(`- **${text(item.label) ?? ""}:** ${display(item.value)}`);
        }
        blank();
        return;
      }
      case "comparison": {
        const beforeLabel = text(p.before_label) ?? "Was";
        const afterLabel = text(p.after_label) ?? "Now";
        for (const item of list(p.items)) {
          push(`- **${text(item.label) ?? ""}:** ${beforeLabel} ${text(item.before) ?? ""} → ${afterLabel} ${text(item.after) ?? ""}`);
        }
        blank();
        return;
      }
      case "item-list": {
        for (const item of list(p.items)) {
          const description = text(item.description);
          const value = item.value === undefined ? null : display(item.value);
          let line = `- **${text(item.title) ?? ""}**`;
          if (description !== null) line += ` — ${description}`;
          if (value !== null) line += ` (${value})`;
          push(line);
        }
        blank();
        return;
      }
      case "phases": {
        for (const stage of list(p.stages)) {
          const note = text(stage.note);
          let line = `- **${text(stage.name) ?? ""}:** ${display(stage.start)} – ${display(stage.end)}`;
          if (note !== null) line += ` — ${note}`;
          push(line);
        }
        if (typeof p.target === "object" && p.target !== null) {
          const target = p.target as Record<string, unknown>;
          const label = text(target.label);
          const at = text(target.at);
          if (label !== null && at !== null) push(`Target: ${label} ${at}`);
        }
        blank();
        return;
      }
      case "breakdown": {
        const unit = text(p.unit);
        for (const part of list(p.parts)) {
          push(`- **${text(part.label) ?? ""}:** ${display(part.value)}${unit !== null ? ` ${unit}` : ""}`);
        }
        blank();
        return;
      }
      case "checklist": {
        for (const item of list(p.items)) {
          const due = text(item.due_at);
          push(`- [${item.done === true ? "x" : " "}] ${text(item.label) ?? ""}${due !== null ? ` (due ${due})` : ""}`);
        }
        blank();
        return;
      }
      case "reference-list": {
        for (const item of list(p.items)) {
          const title2 = text(item.title) ?? "Source";
          const link = text(item.url);
          const source = text(item.source);
          const published = text(item.published_at);
          const note = text(item.note);
          let line = `- ${link !== null ? `[${title2}](${link})` : title2}`;
          if (source !== null) line += ` — ${source}`;
          if (published !== null) line += ` (${published})`;
          if (note !== null) line += ` — ${note}`;
          push(line);
        }
        blank();
        return;
      }
      case "callout": {
        const body = text(p.text);
        if (body === null) return;
        const tone = text(p.tone);
        for (const [index, line] of body.split("\n").entries()) {
          push(`> ${index === 0 && tone !== null ? `**${tone[0].toUpperCase()}${tone.slice(1)}:** ` : ""}${line}`);
        }
        push("");
        return;
      }
      case "quote": {
        const body = text(p.text);
        if (body === null) return;
        push(`> ${body}`);
        const attribution = text(p.attribution);
        if (attribution !== null) push(`> — ${attribution}`);
        push("");
        return;
      }
      case "timeline": {
        for (const event of list(p.events)) {
          const when = text(event.at) ?? text(event.time);
          const place = text(event.place);
          const note = text(event.note);
          let line = `- ${when !== null ? `${when} — ` : ""}**${text(event.title) ?? ""}**`;
          if (place !== null) line += `, ${place}`;
          if (note !== null) line += ` — ${note}`;
          push(line);
        }
        blank();
        return;
      }
      case "link-button": {
        const label = text(p.label) ?? "Link";
        const href = text(p.url);
        push(href !== null ? `[${label}](${href})` : label, "");
        return;
      }
      case "progress": {
        const target = text(p.target_at);
        push(
          `- **${text(p.label) ?? "Progress"}:** ${display(p.current)} / ${display(p.target)}${target !== null ? ` by ${target}` : ""}`,
        );
        return;
      }
      case "code-block": {
        const filename = text(p.filename);
        const language = text(p.language) ?? "";
        const code = typeof p.code === "string" ? p.code : "";
        if (filename !== null) push(`_${filename}_`);
        push(`\`\`\`${language}`, code, "```", "");
        return;
      }
      case "accordion": {
        for (const item of list(p.items)) {
          push(`- **${text(item.title) ?? ""}:** ${text(item.body) ?? ""}`);
        }
        blank();
        return;
      }
      case "decision":
      case "approval": {
        const question = text(p.question);
        if (question !== null) push(`**${question}**`, "");
        const context = text(p.context);
        if (context !== null) push(context, "");
        const chosen = text(p.chosen_id);
        for (const option of list(p.options)) {
          const tradeoff = text(option.tradeoff);
          let line = `- ${text(option.label) ?? ""}`;
          if (chosen !== null && option.id === chosen) line += " (chosen)";
          if (tradeoff !== null) line += ` — ${tradeoff}`;
          push(line);
        }
        const rationale = text(p.rationale);
        if (rationale !== null) push("", `Rationale: ${rationale}`);
        blank();
        return;
      }
      case "chart": {
        const labels = Array.isArray(p.labels) ? (p.labels as unknown[]).map(display) : [];
        const series = list(p.series);
        const yLabel = text(p.y_label);
        push(`_${text(p.presentation) ?? "line"} chart${yLabel !== null ? ` (${yLabel})` : ""}_`, "");
        if (labels.length > 0 && series.length > 0) {
          push(`|  | ${series.map((s) => cell(s.name)).join(" | ")} |`);
          push(`| ${series.map(() => "---").join(" | ")} |`);
          labels.forEach((label, index) => {
            push(`| ${cell(label)} | ${series.map((s) => cell(Array.isArray(s.values) ? s.values[index] : "")).join(" | ")} |`);
          });
        }
        blank();
        return;
      }
      case "attachment-list": {
        for (const item of list(p.items)) {
          const detail = text(item.detail);
          push(`- ${text(item.label) ?? "Attachment"}${detail !== null ? ` — ${detail}` : ""} (attachment)`);
        }
        blank();
        return;
      }
      case "streak-grid": {
        for (const day of list(p.cells)) {
          push(`- ${display(day.date)}: ${display(day.value)}`);
        }
        blank();
        return;
      }
      default: {
        kids();
        return;
      }
    }
  };

  push(`# ${title}`, "");
  const verdict = text(spec.answer?.verdict);
  if (verdict !== null) push(`**TL;DR:** ${verdict}`, "");

  walk(spec.root, 2);

  blank();
  push("---", "", `Updated: ${updatedAt}`);
  if (url !== null && url !== undefined && url !== "") push(`Source: ${url}`);

  // Ensure a blank line before each list and collapse repeated blank lines.
  const tidied: string[] = [];
  for (const line of out) {
    const previous = tidied.at(-1);
    if (
      line.startsWith("- ") &&
      previous !== undefined &&
      previous !== "" &&
      !previous.startsWith("- ")
    ) {
      tidied.push("");
    }
    if (line === "" && previous === "") continue;
    tidied.push(line);
  }
  return `${tidied.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
