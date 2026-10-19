/** A blank line starts a new paragraph; runs of blank lines collapse. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Any stored `emphasis` prop is ignored and renders as plain prose. */
export function Prose({ text }: { text: string }) {
  const parts = paragraphs(text);
  return (
    <div className="flex min-w-0 flex-col gap-4 font-inherit text-foreground">
      {parts.map((part, index) => (
        <p key={index} className="min-w-0 whitespace-pre-line break-words text-body text-foreground">
          {part}
        </p>
      ))}
    </div>
  );
}
