"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CircleDashedIcon } from "@phosphor-icons/react/dist/ssr/CircleDashed";
import { CircleHalfIcon } from "@phosphor-icons/react/dist/ssr/CircleHalf";
import { ClockIcon } from "@phosphor-icons/react/dist/ssr/Clock";
import { ProhibitIcon } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { UserCircleIcon } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { WarningDiamondIcon } from "@phosphor-icons/react/dist/ssr/WarningDiamond";

import { AppIcon, type AppIconData } from "@/shared/ui/app-icon";
import { Badge } from "@/shared/ui/primitives/badge";
import { cn } from "@/shared/ui/cn";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { FormattedValue } from "@/shared/formatting/viewer";
import { surfaceList, surfaceListRow } from "@/page-content/surface";
import { formatPartialIsoDate, isIsoDate, isPartialIsoDate } from "@/shared/formatting/display";

const STATUS_LABEL: Record<string, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  "waiting-on-you": "Waiting on you",
  "waiting-on-them": "Waiting on them",
  blocked: "Blocked",
  "at-risk": "At risk",
  cancelled: "Cancelled",
  done: "Done",
};

/**
 * A `string`, not the schema enum, so a status from a newer catalog resolves to the neutral style
 * instead of crashing the block. `unknownStatusFallback` is the tested seam.
 */
type Status = string;

type Item = {
  id: string;
  label: string;
  status: Status;
  owner?: string;
  since?: string;
  due_at?: string;
  next_check_at?: string;
  note?: string;
};

interface StatusStyle {
  icon: AppIconData;
  badge: string;
}

/** What an unrecognized status renders as: neutral chrome, content kept. */
const NEUTRAL_STATUS: StatusStyle = {
  icon: CircleDashedIcon,
  badge: "bg-muted text-muted-foreground",
};

const STATUS_STYLE: Record<string, StatusStyle> = {
  "not-started": NEUTRAL_STATUS,
  "in-progress": {
    icon: CircleHalfIcon,
    badge: "bg-status-info text-status-info-foreground",
  },
  "waiting-on-you": {
    icon: UserCircleIcon,
    badge: "bg-status-attention text-status-attention-foreground",
  },
  "waiting-on-them": {
    icon: ClockIcon,
    badge: "bg-status-info text-status-info-foreground",
  },
  blocked: {
    icon: WarningCircleIcon,
    badge: "bg-status-danger text-status-danger-foreground",
  },
  "at-risk": {
    icon: WarningDiamondIcon,
    badge: "bg-status-attention text-status-attention-foreground",
  },
  cancelled: {
    icon: ProhibitIcon,
    badge: "bg-muted text-muted-foreground line-through decoration-from-font",
  },
  done: {
    icon: CheckCircleIcon,
    badge: "bg-status-success text-status-success-foreground",
  },
};

/** Sentence-cases an unknown hyphenated status so it reads as a label, not a raw token. */
function humanize(status: string): string {
  const words = status.replace(/[-_]+/g, " ").trim();
  if (words === "") return "Status";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The neutral fallback as a pure function, for tests. */
export function unknownStatusFallback(status: string): { style: StatusStyle; label: string } {
  return {
    style: STATUS_STYLE[status] ?? NEUTRAL_STATUS,
    label: STATUS_LABEL[status] ?? humanize(status),
  };
}

function StatusBadge({ status }: { status: Status }) {
  const { style, label } = unknownStatusFallback(status);
  return (
    <Badge
      variant="secondary"
      className={cn(
        // Cross-fade the colour when a status changes; nothing moves.
        "h-5 shrink-0 gap-1 border-0 px-1.5 text-overline font-medium",
        "transition-[background-color,color] duration-120 ease-(--ease-out)",
        style.badge,
      )}
      data-status={status}
    >
      <AppIcon
        icon={style.icon}
        aria-hidden="true"
        className="size-3"
      />
      {label}
    </Badge>
  );
}

/**
 * `since` at the writer's precision: an instant reads relatively ("6 days ago"), a day as "since
 * Tue, Aug 18", and a year or year-month UTC-pinned via `formatPartialIsoDate`.
 */
function sinceLabel(since: string) {
  if (isPartialIsoDate(since)) return <>since {formatPartialIsoDate(since)}</>;
  if (isIsoDate(since)) return <>since <FormattedValue value={since} /></>;
  return <FormattedValue value={since} />;
}

function ItemRow({
  item,
  last,
}: {
  item: Item;
  last: boolean;
}) {
  const hasMeta = item.owner !== undefined || item.since !== undefined || item.due_at !== undefined || item.next_check_at !== undefined;

  return (
    // Rows do not animate reorders: they come from background polls, and a list being read should
    // not move. The badge cross-fade covers the visible change.
    <li className={cn("min-w-0 py-3", last ? "" : surfaceListRow)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 break-words text-ui font-medium leading-5 tracking-row">
          {item.label}
        </p>
        <StatusBadge status={item.status} />
      </div>
      {hasMeta ? (
        <p className="mt-0.5 break-words text-meta leading-5 text-muted-foreground">
          {[item.owner, item.since === undefined ? undefined : sinceLabel(item.since), item.due_at === undefined ? undefined
            : <>Due <FormattedValue value={item.due_at} /></>, item.next_check_at === undefined ? undefined
            : <>Next check <FormattedValue value={item.next_check_at} /></>]
            .filter((value) => value !== undefined)
            .map((value, index) => (
              <span key={index}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                {value}
              </span>
            ))}
        </p>
      ) : null}
      {item.note !== undefined ? (
        <p className="mt-1 break-words text-supporting leading-5 text-muted-foreground">
          {item.note}
        </p>
      ) : null}
    </li>
  );
}

function ItemCard({ items }: { items: Item[] }) {
  return (
    <ul className={"min-w-0 " + surfaceList}>
      {items.map((item, index) => (
        <ItemRow
          key={item.id}
          item={item}
          last={index === items.length - 1}
        />
      ))}
    </ul>
  );
}

export function StatusList({
  items,
  empty,
}: {
  items: Item[];
  empty?: string;
}) {
  if (items.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  return (
    <div className="min-w-0 font-inherit text-foreground">
      <ItemCard items={items} />
    </div>
  );
}
