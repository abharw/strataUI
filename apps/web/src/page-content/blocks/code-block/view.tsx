"use client";

import { cn } from "@/shared/ui/cn";
import { CopyIconButton } from "@/page-content/copy-button";
import { ScrollCue, useHorizontalOverflow } from "@/page-content/overflow-cue";
import { surfaceContained } from "@/page-content/surface";

type CodeKind = "code" | "diff";

function DiffCode({ code }: { code: string }) {
  return code.split("\n").map((line, index) => {
    const tone = line.startsWith("+") && !line.startsWith("+++")
      ? "bg-status-success text-status-success-foreground"
      : line.startsWith("-") && !line.startsWith("---")
        ? "bg-status-danger text-status-danger-foreground"
        : "";
    return (
      <span key={index} className={cn("block min-h-[1.45em] px-5", tone)}>
        {line || "\u00a0"}
      </span>
    );
  });
}

export function CodeBlock({
  code,
  language,
  filename,
  kind = "code",
}: {
  code: string;
  language?: string;
  filename?: string;
  kind?: CodeKind;
}) {
  const caption = filename ?? language ?? (kind === "diff" ? "Diff" : "Code");
  // Long lines get the same measured overflow cue as the table and chart data.
  const { ref: scroller, scroll, hintId, describedBy } = useHorizontalOverflow<HTMLPreElement>();

  return (
    <figure className={cn("min-w-0 overflow-hidden", surfaceContained, "bg-muted/40 text-foreground")}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 pl-5">
        <figcaption className="min-w-0 truncate font-mono text-meta font-medium leading-5">
          {caption}
        </figcaption>
        <CopyIconButton text={code} label={`Copy ${filename ?? "code"}`} />
      </div>
      <div className="relative">
        <pre
          ref={scroller}
          tabIndex={0}
          aria-label={`${kind === "diff" ? "Diff" : "Code"}: ${caption}`}
          aria-describedby={describedBy}
          className={cn(
            "max-w-full overflow-x-auto py-5 font-mono text-meta leading-(--leading-code) [overscroll-behavior-x:contain]",
            kind === "code" && "px-5",
          )}
        >
          <code data-language={language} className="block w-max min-w-full whitespace-pre">
            {kind === "diff" ? <DiffCode code={code} /> : code}
          </code>
        </pre>
        <ScrollCue state={scroll} hint="Scroll horizontally for the full line" hintId={hintId} />
      </div>
    </figure>
  );
}
