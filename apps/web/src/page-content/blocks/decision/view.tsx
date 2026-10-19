import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/dist/ssr/Clock";

import { AppIcon } from "@/shared/ui/app-icon";
import { Badge } from "@/shared/ui/primitives/badge";
import { cn } from "@/shared/ui/cn";
import { surfaceContained, surfaceCardPad, surfaceListRow } from "@/page-content/surface";
import { GeneratedHeading } from "@/page-content/blocks/section/view";

type Option = { id: string; label: string; tradeoff?: string };

export function Decision({
  question,
  options,
  chosen_id,
  rationale,
}: {
  question: string;
  options: readonly Option[];
  chosen_id?: string;
  rationale?: string;
}) {
  const settled = chosen_id !== undefined && options.some((option) => option.id === chosen_id);
  return (
    <section className={"min-w-0 " + surfaceContained + " " + surfaceCardPad + " font-inherit text-foreground"}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <GeneratedHeading className="min-w-0 break-words text-body font-medium leading-6 tracking-row">
          {question}
        </GeneratedHeading>
        <Badge
          variant={settled ? "secondary" : "outline"}
          className={cn(
            "h-6 shrink-0 gap-1 px-2 text-overline font-medium",
            settled
              ? "bg-status-success text-status-success-foreground"
              : "border-border bg-transparent text-muted-foreground",
          )}
        >
          <AppIcon
            icon={settled ? CheckCircleIcon : ClockIcon}
            aria-hidden="true"
            className="size-3"
          />
          {settled ? "Decided" : "Open"}
        </Badge>
      </div>
      <ul className="mt-3 flex flex-col border-t border-border">
        {options.map((option, index) => {
          const chosen = option.id === chosen_id;
          return (
            <li
              key={option.id}
              className={cn(
                "min-w-0 px-1 py-3",
                index < options.length - 1 ? surfaceListRow : null,
                chosen ? "bg-status-success" : null,
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {chosen ? (
                  <AppIcon
                    icon={CheckCircleIcon}
                    aria-hidden="true"
                    className="size-4 shrink-0 text-status-success-foreground"
                  />
                ) : null}
                <p className="min-w-0 break-words text-ui font-medium leading-5">
                  {option.label}
                  {chosen ? <span className="sr-only"> (selected)</span> : null}
                </p>
              </div>
              {option.tradeoff !== undefined ? (
                <p className="mt-1 break-words text-supporting leading-5 text-muted-foreground">
                  {option.tradeoff}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rationale !== undefined ? (
        <p className="mt-3 break-words text-supporting leading-5 text-muted-foreground">{rationale}</p>
      ) : null}
    </section>
  );
}
