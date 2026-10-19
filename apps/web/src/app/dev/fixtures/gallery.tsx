import type { ReactNode } from "react";

import { move, releaseReview, triathlon, trip } from "@/page-content/document/fixtures";
import { ViewerFormattingProvider } from "@/shared/formatting/viewer";
import { PageShell } from "@/features/navigation/page-shell";
import { formatDisplayValue } from "@/shared/formatting/display";
import { PageFrame } from "@/features/page-viewer/page-frame";
import type { StrataSpec } from "@/page-content/schema";

import { FixtureDevtools } from "./devtools";
import { FixtureProviders } from "./providers";

// No request backs this render, so the gallery supplies its own `serverNow`.
function FixtureShell({ children }: { children: ReactNode }) {
  return (
    <ViewerFormattingProvider serverNow={new Date().toISOString()}>
      <PageShell>{children}</PageShell>
    </ViewerFormattingProvider>
  );
}

// Owner-only wording; reader assembly strips `source_event`.
function provenanceLine(sourceEvent?: { at: string; excerpt: string }): string | undefined {
  if (sourceEvent === undefined) return undefined;
  const day = formatDisplayValue(sourceEvent.at.slice(0, 10));
  return `from your message ${day} · “${sourceEvent.excerpt}”`;
}

const moveHistory = move.spec.elements["move-history"];
if (moveHistory?.type !== "timeline") {
  throw new Error("The move fixture must keep its timeline coverage");
}

const tripItinerary = trip.spec.elements["arrival-events"];
if (tripItinerary?.type !== "timeline") {
  throw new Error("The trip fixture must keep its timeline coverage");
}

const historyTimelineReview: StrataSpec = {
  root: "move-history",
  elements: { "move-history": moveHistory },
};

const itineraryTimelineReview: StrataSpec = {
  root: "arrival-events",
  elements: { "arrival-events": tripItinerary },
};

// `move-floor-plan` resolves; `move-window-reference` is absent from the resolver, so its row
// shows the unavailable state.
const attachmentGalleryReview: StrataSpec = {
  answer: {
    verdict: "One reference resolves; the other shows the unavailable row.",
  },
  root: "fixture-gallery",
  elements: {
    "fixture-gallery": {
      type: "section",
      props: {},
      children: ["fixture-gallery-images"],
    },
    "fixture-gallery-images": {
      type: "attachment-list",
      props: {
        items: [
          {
            id: "floor-plan",
            resource_id: "move-floor-plan",
            label: "Apartment floor plan",
            kind: "image",
          },
          {
            id: "window-reference",
            resource_id: "move-window-reference",
            label: "Window reference",
            kind: "image",
          },
        ],
      },
      children: [],
    },
  },
};

// `card` variants in isolation, one per frame.
const cardCoverReview: StrataSpec = {
  root: "card-cover-demo",
  elements: {
    "card-cover-demo": { type: "section", props: {}, children: ["cover-card"] },
    "cover-card": {
      type: "card",
      props: {
        title: "Maple Street",
        description: "2BR, laundry in unit, 12 min to the office.",
        media: { resource_id: "move-floor-plan", alt: "Floor plan of the Maple Street apartment" },
      },
      children: [],
    },
  },
};

const cardStatReview: StrataSpec = {
  root: "card-stat-demo",
  elements: {
    "card-stat-demo": { type: "section", props: {}, children: ["stat-card"] },
    "stat-card": { type: "card", props: { title: "This week" }, children: ["stat-card-metric"] },
    "stat-card-metric": { type: "metric", props: { label: "Miles run", value: 18 }, children: [] },
  },
};

const cardLinkedReview: StrataSpec = {
  root: "card-linked-demo",
  elements: {
    "card-linked-demo": { type: "section", props: {}, children: ["linked-card"] },
    "linked-card": {
      type: "card",
      props: {
        title: "Race day plan",
        description: "Transition layout, wave time, and the packet pickup checklist.",
        link: { url: "https://example.org/olympic-tri-2026/athlete-guide" },
      },
      children: [],
    },
  },
};

const cardFooterReview: StrataSpec = {
  root: "card-footer-demo",
  elements: {
    "card-footer-demo": { type: "section", props: {}, children: ["footer-card"] },
    "footer-card": {
      type: "card",
      props: {
        title: "Metro Movers",
        description: "Full-service, insured, and available the weekend of the move.",
        footer: "$1,850",
      },
      children: [],
    },
  },
};

// Days are relative to now so the `by-day` pager opens on a day with rows.
function isoDaysFromNow(delta: number): string {
  return new Date(Date.now() + delta * 86_400_000).toISOString().slice(0, 10);
}

const itemListByDayReview: StrataSpec = {
  root: "by-day-demo",
  elements: {
    "by-day-demo": { type: "section", props: { title: "This week" }, children: ["by-day-sessions"] },
    "by-day-sessions": {
      type: "item-list",
      props: {
        presentation: "by-day",
        items: [
          { id: "d-2-run", title: "Easy run", description: "Zone 2, conversational", value: { value: 5, unit: "km" }, on: isoDaysFromNow(-2) },
          { id: "d-1-lift", title: "Strength · upper", description: "Bench and rows, RPE 8", value: "48 min", on: isoDaysFromNow(-1) },
          { id: "d0-tempo", title: "Tempo run", description: "3 × 8 min at threshold", value: { value: 8, unit: "km" }, on: isoDaysFromNow(0) },
          { id: "d0-mobility", title: "Mobility", description: "Hips and calves after the run", value: "15 min", on: isoDaysFromNow(0) },
          { id: "d1-swim", title: "Swim", description: "Bay Club, 6 × 200 steady", value: { value: 1.6, unit: "km" }, on: isoDaysFromNow(1) },
          { id: "d3-long", title: "Long run", description: "5:1 run-walk, walk every aid station", value: { value: 18, unit: "km" }, on: isoDaysFromNow(3) },
        ],
      },
      children: [],
    },
  },
};

interface FixtureFrame {
  id: string;
  title: string;
  detail?: string;
  spec: StrataSpec;
}

const frames: FixtureFrame[] = [
  {
    id: "attachment-gallery",
    title: "Attachment gallery",
    detail: "Host-verified image assets · tap the resolved preview",
    spec: attachmentGalleryReview,
  },
  {
    id: "timeline-history",
    title: "Timeline · history",
    detail: "Brooklyn move history · past events, newest first",
    spec: historyTimelineReview,
  },
  {
    id: "timeline-itinerary",
    title: "Timeline · itinerary",
    detail: "Lisbon arrival · future events, earliest first",
    spec: itineraryTimelineReview,
  },
  {
    id: "card-cover",
    title: "Card · cover",
    detail: "Media and title alone, zero children, still a complete card",
    spec: cardCoverReview,
  },
  {
    id: "card-stat",
    title: "Card · stat",
    detail: "card + metric",
    spec: cardStatReview,
  },
  {
    id: "card-linked",
    title: "Card · linked",
    detail: "The whole card is the tap target, chevron in the header row",
    spec: cardLinkedReview,
  },
  {
    id: "card-footer",
    title: "Card · footer",
    detail: "Footer text at the base",
    spec: cardFooterReview,
  },
  {
    id: "item-list-by-day",
    title: "Item-list · by-day",
    detail: "One day at a time, opened on today · previous and next step the days",
    spec: itemListByDayReview,
  },
  {
    id: "triathlon",
    title: triathlon.meta.title,
    detail: provenanceLine(triathlon.meta.source_event),
    spec: triathlon.spec,
  },
  {
    id: "trip",
    title: trip.meta.title,
    detail: provenanceLine(trip.meta.source_event),
    spec: trip.spec,
  },
  {
    id: "release-review",
    title: releaseReview.meta.title,
    detail: provenanceLine(releaseReview.meta.source_event),
    spec: releaseReview.spec,
  },
  {
    id: "move",
    title: move.meta.title,
    detail: provenanceLine(move.meta.source_event),
    spec: move.spec,
  },
];

export function FixtureGallery() {
  return (
    <FixtureShell>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h1 className="text-meta font-semibold text-muted-foreground">
          Dev fixtures
        </h1>
        <FixtureDevtools
          frames={frames.map(({ id, title, spec }) => ({ id, title, spec }))}
        />
      </header>

      <FixtureProviders>
        {frames.map((frame) => (
          <PageFrame
            key={frame.id}
            title={frame.title}
            detail={frame.detail}
            spec={frame.spec}
            titleAs="h2"
          />
        ))}
      </FixtureProviders>
    </FixtureShell>
  );
}
