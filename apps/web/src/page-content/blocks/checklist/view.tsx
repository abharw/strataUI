import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CircleIcon } from "@phosphor-icons/react/dist/ssr/Circle";

import { AppIcon } from "@/shared/ui/app-icon";
import { cn } from "@/shared/ui/cn";
import { BlockLink, type HydratedLink } from "@/page-content/block-link";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { NewContextHint } from "@/page-content/external-link";
import { surfaceList, surfaceListRow } from "@/page-content/surface";
import { FormattedValue } from "@/shared/formatting/viewer";

type Step = {
  id: string;
  label: string;
  done: boolean;
  due_at?: string;
  link?: HydratedLink;
};

/**
 * The step label, linked when the author gave a `link`. The checkbox and deadline stay outside the
 * link; the function form of `BlockLink` keeps the external icon on the label's last line.
 */
function StepLabel({ item }: { item: Step }) {
  const className = cn(
    "min-w-0 break-words text-ui leading-5",
    item.done && "text-muted-foreground line-through decoration-foreground/25",
  );

  if (item.link === undefined) return <p className={className}>{item.label}</p>;

  const tappable = item.link.url !== undefined || item.link.href !== undefined;
  return (
    <BlockLink link={item.link} className="block min-w-0">
      {({ external }) => (
        <p className={cn(className, tappable && "underline decoration-muted-foreground/40 underline-offset-2")}>
          {item.label}
          {external ? (
            <>
              <NewContextHint />
              <AppIcon icon={ArrowSquareOutIcon} data-icon="inline-end" aria-hidden="true" />
            </>
          ) : null}
        </p>
      )}
    </BlockLink>
  );
}

export function Checklist({
  items,
  empty,
}: {
  // Stored props are as authored, so `done` may be undefined; treat that as not done.
  items: { id: string; label: string; done?: boolean; due_at?: string; link?: HydratedLink }[];
  empty?: string;
}) {
  if (items.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  const steps: Step[] = items.map((item) => ({ ...item, done: item.done ?? false }));
  return (
    <ul className={"flex min-w-0 flex-col " + surfaceList + " font-inherit text-foreground"}>
      {steps.map((item, index) => (
        <li
          key={item.id}
          className={`flex min-h-14 min-w-0 items-center gap-3.5 py-3 ${
            index < steps.length - 1 ? surfaceListRow : ""
          }`}
        >
          <span
            className={
              item.done
                ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                : "flex size-6 shrink-0 items-center justify-center text-muted-foreground/60"
            }
            aria-hidden="true"
          >
            {item.done ? (
              <AppIcon icon={CheckIcon} className="size-3.5" weight="bold" />
            ) : (
              <AppIcon icon={CircleIcon} className="size-6" />
            )}
          </span>
          <div className="min-w-0">
            <StepLabel item={item} />
            {item.due_at !== undefined ? (
              <p className="mt-0.5 text-meta leading-5 text-muted-foreground">
                Due <FormattedValue value={item.due_at} />
              </p>
            ) : null}
          </div>
          <span className="sr-only">{item.done ? "Completed" : "Not completed"}</span>
        </li>
      ))}
    </ul>
  );
}
