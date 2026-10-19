export function Quote({
  text,
  attribution,
}: {
  text: string;
  attribution?: string;
}) {
  return (
    <figure className="border-y border-border py-5 font-inherit text-foreground">
      <blockquote className="text-heading font-medium leading-7 tracking-row">
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </blockquote>
      {attribution ? (
        <figcaption className="mt-2.5 text-meta font-medium text-muted-foreground">
          {attribution}
        </figcaption>
      ) : null}
    </figure>
  );
}
