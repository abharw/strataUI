import { MapPinIcon } from "@phosphor-icons/react/dist/ssr/MapPin";
import { TicketIcon } from "@phosphor-icons/react/dist/ssr/Ticket";

import { AppIcon } from "@/shared/ui/app-icon";
import {
  Timeline as ReuiTimeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@/shared/ui/primitives/timeline";
import {
  formatPartialIsoDate,
  isIsoDate,
  isIsoDateTime,
  isPartialIsoDate,
} from "@/shared/formatting/display";
import { BlockLink, type HydratedLink } from "@/page-content/block-link";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { surfaceList } from "@/page-content/surface";
import {
  FormattedValue,
  useViewerFormatting,
} from "@/shared/formatting/viewer";
import { GeneratedHeading } from "@/page-content/blocks/section/view";

type Event = {
  id: string;
  at?: string;
  time?: string;
  title: string;
  note?: string;
  place?: string;
  ref?: string;
  link?: HydratedLink;
};

type TimelineOrder = "ascending" | "descending" | "as-provided";

function formatTime(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

/**
 * Compares only precision both events have: dates as ISO prefixes ("2019" < "2019-06" <
 * "2019-06-04"), and two exact instants by time, since offsets may differ.
 */
function compareWhen(a: Event, b: Event): number {
  if (a.at !== undefined && b.at !== undefined) {
    const aExact = isIsoDateTime(a.at);
    const bExact = isIsoDateTime(b.at);

    if (aExact && bExact) return Date.parse(a.at) - Date.parse(b.at);

    const day = a.at.slice(0, 10).localeCompare(b.at.slice(0, 10));
    if (day !== 0) return day;

    const aClock = a.time ?? (aExact ? a.at.slice(11, 19) : undefined);
    const bClock = b.time ?? (bExact ? b.at.slice(11, 19) : undefined);
    if (aClock === undefined || bClock === undefined) return 0;
    return aClock.localeCompare(bClock);
  }

  if (a.time !== undefined && b.time !== undefined) {
    return a.time.localeCompare(b.time);
  }
  return 0;
}

function orderEvents(events: Event[], order: TimelineOrder): Event[] {
  if (order === "as-provided") return [...events];
  const direction = order === "ascending" ? 1 : -1;
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => direction * compareWhen(a.event, b.event) || a.index - b.index)
    .map(({ event }) => event);
}

function oneSharedDate(events: Event[]): string | undefined {
  const first = events[0]?.at;
  if (first === undefined || !isIsoDate(first)) return undefined;
  return events.every((event) => event.at === first) ? first : undefined;
}

function semanticDateTime(event: Event): string | undefined {
  // Only a full calendar date can absorb a wall-clock time into one machine
  // value; a year or year-month stays what it is.
  if (event.at !== undefined && event.time !== undefined && isIsoDate(event.at)) {
    return `${event.at}T${event.time}`;
  }
  return event.at ?? event.time;
}

export function Timeline({
  events,
  empty,
  // Stored props are as authored, so `order` may be undefined despite the schema default.
  order = "ascending",
}: {
  events: Event[];
  empty?: string;
  order?: TimelineOrder;
}) {
  const { format } = useViewerFormatting();
  if (events.length === 0) {
    return empty === undefined ? null : <CollectionEmpty text={empty} />;
  }

  const sorted = orderEvents(events, order);
  const sharedDate = oneSharedDate(sorted);
  const hasTemporalGutter = sorted.some(
    (event) => event.at !== undefined || event.time !== undefined,
  );

  const whenLabel = (event: Event): string | undefined => {
    if (sharedDate !== undefined) {
      return event.time === undefined ? "All day" : formatTime(event.time);
    }
    if (event.at !== undefined && isPartialIsoDate(event.at)) {
      return formatPartialIsoDate(event.at);
    }
    if (event.at !== undefined && !isIsoDate(event.at)) {
      return format.display(event.at);
    }
    if (event.at !== undefined && event.time !== undefined) {
      return `${format.display(event.at)} · ${formatTime(event.time)}`;
    }
    if (event.at !== undefined) return format.display(event.at);
    if (event.time !== undefined) return formatTime(event.time);
    return undefined;
  };

  return (
    <div className="min-w-0 font-inherit text-foreground">
      {sharedDate !== undefined ? (
        <p className="mb-3 px-1 text-lead font-medium leading-tight tracking-tight">
          <FormattedValue value={sharedDate} />
        </p>
      ) : null}
      <ReuiTimeline
        aria-label="Timeline"
        className={"min-w-0 pt-4 " + surfaceList}
        role="list"
        value={0}
      >
        {sorted.map((event, index) => {
          const when = whenLabel(event);
          const hasDetails =
            event.note !== undefined
            || event.place !== undefined
            || event.ref !== undefined;
          return (
            <TimelineItem
              key={event.id}
              className={
                "min-w-0 "
                + (hasTemporalGutter
                  ? "sm:group-data-[orientation=vertical]/timeline:ms-32"
                  : "")
              }
              role="listitem"
              step={index + 1}
            >
              <TimelineHeader className="min-w-0">
                {/* Same gray as the ring so the rail is visible. */}
                <TimelineSeparator className="bg-muted-foreground" />
                {when !== undefined ? (
                  <TimelineDate
                    className="text-micro leading-5 tabular-nums sm:group-data-[orientation=vertical]/timeline:absolute sm:group-data-[orientation=vertical]/timeline:-left-32 sm:group-data-[orientation=vertical]/timeline:w-20 sm:group-data-[orientation=vertical]/timeline:text-right"
                    dateTime={semanticDateTime(event)}
                    title={
                      event.at !== undefined && !isIsoDate(event.at)
                        ? format.absoluteDateTime(event.at)
                        : undefined
                    }
                  >
                    {when}
                  </TimelineDate>
                ) : null}
                {/* Only the title is linked: wrapping the grid item would move the rail. */}
                <GeneratedHeading className="break-words text-ui font-medium leading-5 tracking-row sm:-mt-0.5">
                  <BlockLink
                    link={event.link}
                    className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-xs"
                  >
                    {event.title}
                  </BlockLink>
                </GeneratedHeading>
                {/* Secondary gray rather than the hairline token so the ring is visible; hollow to
                    match the outlined place and reference glyphs. */}
                <TimelineIndicator className="border-muted-foreground bg-background" />
              </TimelineHeader>
              {hasDetails ? (
                <TimelineContent className="mt-1 min-w-0 text-muted-foreground">
                  {event.note !== undefined ? (
                    <p className="break-words text-supporting leading-5">
                      {event.note}
                    </p>
                  ) : null}
                  {event.place !== undefined ? (
                    <p className="mt-1 flex min-w-0 items-start gap-1 text-meta leading-5 text-muted-foreground first:mt-0">
                      <AppIcon
                        icon={MapPinIcon}
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span className="break-words">{event.place}</span>
                    </p>
                  ) : null}
                  {event.ref !== undefined ? (
                    <p className="mt-0.5 flex min-w-0 items-start gap-1 text-meta leading-5 text-muted-foreground first:mt-0">
                      <AppIcon
                        icon={TicketIcon}
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span className="break-words">{event.ref}</span>
                    </p>
                  ) : null}
                </TimelineContent>
              ) : null}
            </TimelineItem>
          );
        })}
      </ReuiTimeline>
    </div>
  );
}
