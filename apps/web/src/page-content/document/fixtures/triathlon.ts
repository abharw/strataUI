/**
 * Fixture: an eight-week triathlon plan with trackers, a queue, charts and a carousel of weeks.
 * Exercises each chart and breakdown default with `presentation: null`. Ids are the kebab-case
 * label with no component suffix.
 */
import type { StrataSpec } from "@/page-content/schema";
import type { Meta } from "@/page-content/document/types";

type PageFixture = { meta: Meta; spec: StrataSpec };

export const triathlon: PageFixture = {
  meta: {
    title: "Olympic triathlon",
    slug: "olympic-triathlon",
    kind: "living",
    source_event: {
      id: "msg_01j9wq4k7c8p2v",
      at: "2026-08-19T09:14:00-07:00",
      excerpt: "train me for a triathlon",
    },
    url: "/share/pgk_r7qkzn4m2vh8ac6t",
    written_registry_version: 9,
    created_at: "2026-08-19T09:14:22-07:00",
    updated_at: "2026-08-21T07:02:11-07:00",
  },
  spec: {
    answer: {
      verdict: "Week 3 of 8, on plan at 8.5 of 11 hours. The wetsuit rental is the only thing waiting on you.",
    },
    root: "triathlon-training",
    elements: {
      "triathlon-training": {
        type: "section",
        props: {},
        children: [
          "weekly-glance",
          "this-week",
          "race-brief",
          "open-loops",
          "training-load",
          "plan-phases",
          "eight-week-plan",
          "race-week",
          "race-registration",
          "coach-note",
        ],
      },

      "race-brief": {
        type: "callout",
        props: {
          text: "1.5 km swim, 40 km bike, 10 km run.",
          tone: "note",
        },
        children: [],
      },

      /* ---- trackers --------------------------------------------------- */

      "this-week": {
        type: "section",
        props: { title: "This week" },
        children: ["weekly-volume", "plan-progress"],
      },
      "weekly-glance": {
        type: "grid",
        props: {},
        children: [
          "race-day",
          "hours-this-week",
          "longest-ride",
          "swim-pace",
        ],
      },
      // A calendar date renders without timezone shifting.
      "race-day": {
        type: "metric",
        props: { label: "Race day", value: "2026-10-04" },
        children: [],
      },
      "hours-this-week": {
        type: "metric",
        props: {
          label: "Hours this week",
          value: { value: 8.5, unit: "h" },
        },
        children: [],
      },
      "longest-ride": {
        type: "metric",
        props: {
          label: "Longest ride",
          value: { value: 64, unit: "km" },
        },
        children: [],
      },
      "swim-pace": {
        type: "metric",
        props: {
          label: "Swim pace",
          value: { value: 1.58, unit: "min/100m" },
        },
        children: [],
      },
      "weekly-volume": {
        type: "progress",
        props: {
          label: "Weekly volume",
          current: { value: 8.5, unit: "h" },
          target: { value: 11, unit: "h" },
        },
        children: [],
      },
      "plan-progress": {
        type: "progress",
        props: {
          label: "Plan progress",
          current: { value: 3, unit: "weeks" },
          target: { value: 8, unit: "weeks" },
        },
        children: [],
      },

      /* ---- open loops ------------------------------------------------- */

      "open-loops": {
        type: "status-list",
        props: {
          items: [
            {
              id: "wetsuit-rental",
              label: "Reserve a wetsuit",
              status: "waiting-on-you",
              since: "2026-08-14",
            },
            {
              id: "bike-fit",
              label: "Bike fit",
              status: "waiting-on-them",
              owner: "Ride Studio",
              since: "2026-08-18",
              note: "Thursday slot promised.",
            },
            {
              id: "pool-membership",
              label: "Lap-swim membership",
              status: "blocked",
              since: "2026-08-11",
              note: "Pool closed until Sep 1.",
            },
            {
              id: "race-entry",
              label: "Race entry paid",
              status: "done",
              since: "2026-08-19",
            },
          ],
        },
        children: [],
      },

      /* ---- training load --------------------------------------------- */

      "training-load": {
        type: "section",
        props: { title: "Training load" },
        children: [
          "hours-per-week",
          "discipline-hours",
          "session-load",
          "daily-consistency",
          "training-mix",
          "season-volume",
        ],
      },
      // Time axis, no stacking: draws a line.
      "hours-per-week": {
        type: "chart",
        props: {
          presentation: null,
          x: { kind: "time" },
          labels: [
            "2026-08-03",
            "2026-08-10",
            "2026-08-17",
            "2026-08-24",
            "2026-08-31",
            "2026-09-07",
            "2026-09-14",
            "2026-09-21",
          ],
          series: [
            { name: "Planned", values: [6, 7, 8.5, 9, 10, 11, 9, 6] },
            { name: "Actual", values: [6.2, 7.4, 8.5, 0, 0, 0, 0, 0] },
          ],
          y_label: "hours",
          y_min: 0,
          y_max: 12,
        },
        children: [],
      },
      // Time axis, stacked: draws an area.
      "discipline-hours": {
        type: "chart",
        props: {
          presentation: null,
          x: { kind: "time" },
          stack: "stacked",
          labels: [
            "2026-08-03",
            "2026-08-10",
            "2026-08-17",
            "2026-08-24",
            "2026-08-31",
            "2026-09-07",
            "2026-09-14",
            "2026-09-21",
          ],
          series: [
            { name: "Swim", values: [1.2, 1.4, 1.5, 1.6, 1.8, 2, 1.6, 1.1] },
            { name: "Bike", values: [3.2, 3.8, 4.5, 4.8, 5.4, 6, 4.8, 3.2] },
            { name: "Run", values: [1.8, 2.2, 2.5, 2.6, 2.8, 3, 2.6, 1.7] },
          ],
          y_label: "hours",
        },
        children: [],
      },
      // Labels too long for vertical bars: draws horizontal bars.
      "session-load": {
        type: "chart",
        props: {
          presentation: null,
          show_values: true,
          labels: ["Open-water swim", "Long ride", "Tempo run", "Brick", "Spin"],
          series: [{ name: "Minutes", values: [55, 165, 48, 120, 40] }],
          y_label: "minutes",
        },
        children: [],
      },
      "daily-consistency": {
        type: "streak-grid",
        props: {
          cells: [
            { date: "2026-08-03", value: 1 },
            { date: "2026-08-04", value: 1 },
            { date: "2026-08-05", value: 0 },
            { date: "2026-08-06", value: 1 },
            { date: "2026-08-07", value: 1 },
            { date: "2026-08-08", value: 2 },
            { date: "2026-08-09", value: 0 },
            { date: "2026-08-10", value: 1 },
            { date: "2026-08-11", value: 1 },
            { date: "2026-08-12", value: 1 },
            { date: "2026-08-13", value: 0 },
            { date: "2026-08-14", value: 1 },
            { date: "2026-08-15", value: 2 },
            { date: "2026-08-16", value: 1 },
            { date: "2026-08-17", value: 1 },
            { date: "2026-08-18", value: 1 },
            { date: "2026-08-19", value: 1 },
            { date: "2026-08-20", value: 0 },
            { date: "2026-08-21", value: 1 },
          ],
        },
        children: [],
      },
      // With `total_label`: draws a donut with the total in the middle.
      "training-mix": {
        type: "breakdown",
        props: {
          presentation: null,
          parts: [
            { id: "swim", label: "Swim", value: 1.5 },
            { id: "bike", label: "Bike", value: 4.5 },
            { id: "run", label: "Run", value: 2.5 },
          ],
          unit: "h",
          total_label: "This week",
        },
        children: [],
      },
      // Many parts and no total: draws bars.
      "season-volume": {
        type: "breakdown",
        props: {
          presentation: null,
          parts: [
            { id: "pool-swim", label: "Pool swim", value: 9.5 },
            { id: "open-water", label: "Open water", value: 3 },
            { id: "long-ride", label: "Long ride", value: 14 },
            { id: "intervals", label: "Intervals", value: 6.5 },
            { id: "easy-run", label: "Easy run", value: 8 },
            { id: "tempo-run", label: "Tempo run", value: 4 },
            { id: "brick", label: "Brick", value: 5.5 },
          ],
          unit: "h",
        },
        children: [],
      },

      /* ---- the plan: weeks 1–2 done and open, 3–8 stacked ------------- */

      // The renderer derives the current stage from the viewer's clock.
      "plan-phases": {
        type: "phases",
        props: {
          stages: [
            { id: "base", name: "Base", start: "2026-08-03", end: "2026-08-24" },
            { id: "build", name: "Build", start: "2026-08-24", end: "2026-09-24" },
            { id: "taper", name: "Taper", start: "2026-09-24", end: "2026-10-04" },
          ],
          target: { label: "Race day", at: "2026-10-04" },
        },
        children: [],
      },
      "eight-week-plan": {
        type: "section",
        props: { title: "Eight-week plan" },
        children: ["week-1", "week-2", "remaining-weeks"],
      },
      "week-1": {
        type: "checklist",
        props: {
          items: [
            { id: "w1-swim", label: "Swim 2 × 1,200 m", done: true },
            { id: "w1-bike", label: "Bike 2 × 32 km", done: true },
            { id: "w1-run", label: "Run 3 × 5 km", done: true },
            { id: "w1-brick", label: "Brick: 20 km bike + 3 km run", done: true },
          ],
        },
        children: [],
      },
      "week-2": {
        type: "checklist",
        props: {
          items: [
            { id: "w2-swim", label: "Swim 2 × 1,500 m", done: true },
            { id: "w2-bike", label: "Bike 45 km long ride", done: true },
            { id: "w2-run", label: "Run 3 × 6 km", done: true },
            { id: "w2-brick", label: "Brick: 30 km bike + 4 km run", done: true },
          ],
        },
        children: [],
      },
      // Carousel children must be cards, so each week's checklist sits in a card.
      "remaining-weeks": {
        type: "carousel",
        props: {},
        children: ["week-3", "week-4", "week-5", "week-6", "week-7", "week-8"],
      },
      "week-3": {
        type: "card",
        props: { title: "Week 3" },
        children: ["week-3-steps"],
      },
      "week-4": {
        type: "card",
        props: { title: "Week 4" },
        children: ["week-4-steps"],
      },
      "week-5": {
        type: "card",
        props: { title: "Week 5" },
        children: ["week-5-steps"],
      },
      "week-6": {
        type: "card",
        props: { title: "Week 6" },
        children: ["week-6-steps"],
      },
      "week-7": {
        type: "card",
        props: { title: "Week 7" },
        children: ["week-7-steps"],
      },
      "week-8": {
        type: "card",
        props: { title: "Week 8" },
        children: ["week-8-steps"],
      },
      "week-3-steps": {
        type: "checklist",
        props: {
          items: [
            { id: "w3-swim", label: "Swim 2 × 1,500 m + open water", done: true },
            { id: "w3-bike", label: "Bike 52 km long ride", done: true },
            { id: "w3-run", label: "Run 3 × 7 km", done: false },
            { id: "w3-brick", label: "Brick: 35 km bike + 5 km run", done: false },
          ],
        },
        children: [],
      },
      "week-4-steps": {
        type: "checklist",
        props: {
          items: [
            { id: "w4-swim", label: "Swim 3 × 1,500 m", done: false },
            { id: "w4-bike", label: "Bike 60 km long ride", done: false },
            { id: "w4-run", label: "Run 2 × 8 km + tempo", done: false },
            { id: "w4-brick", label: "Brick: 40 km bike + 5 km run", done: false },
          ],
        },
        children: [],
      },
      "week-5-steps": {
        type: "checklist",
        props: {
          items: [
            { id: "w5-swim", label: "Swim 3 × 1,800 m", done: false },
            { id: "w5-bike", label: "Bike 70 km long ride", done: false },
            { id: "w5-run", label: "Run 8 km + 10 km", done: false },
            { id: "w5-brick", label: "Brick: 40 km bike + 8 km run", done: false },
          ],
        },
        children: [],
      },
      "week-6-steps": {
        type: "checklist",
        props: {
          items: [
            { id: "w6-swim", label: "Swim 3 × 1,800 m, one open", done: false },
            { id: "w6-bike", label: "Bike 75 km long ride", done: false },
            { id: "w6-run", label: "Run 10 km at race pace", done: false },
            { id: "w6-brick", label: "Brick: 45 km bike + 8 km run", done: false },
          ],
        },
        children: [],
      },
      "week-7-steps": {
        type: "checklist",
        props: {
          items: [
            { id: "w7-swim", label: "Swim 2 × 1,500 m race pace", done: false },
            { id: "w7-bike", label: "Bike 60 km, race-pace blocks", done: false },
            { id: "w7-run", label: "Run 2 × 8 km", done: false },
            { id: "w7-brick", label: "Dress rehearsal: 40 + 10 km", done: false },
          ],
        },
        children: [],
      },
      "week-8-steps": {
        type: "checklist",
        props: {
          items: [
            { id: "w8-swim", label: "Swim 2 × 1,000 m easy", done: false },
            { id: "w8-bike", label: "Bike 30 km with three openers", done: false },
            { id: "w8-run", label: "Run 2 × 4 km easy", done: false },
            { id: "w8-travel", label: "Pack the transition bag", done: false },
          ],
        },
        children: [],
      },

      /* ---- race week -------------------------------------------------- */

      "race-week": {
        type: "section",
        props: { title: "Race week" },
        children: ["race-week-plan"],
      },
      // One external link, one Strata page link, and one unlinked event.
      "race-week-plan": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            {
              id: "packet-pickup",
              at: "2026-10-02",
              time: "16:00",
              title: "Packet pickup",
              ref: "Bib 418",
              link: { url: "https://example.org/olympic-tri-2026/athlete-guide" },
            },
            {
              id: "recon-swim",
              at: "2026-10-03",
              time: "08:30",
              title: "Recon swim",
              place: "Lake Union",
            },
            {
              id: "race-start",
              at: "2026-10-04",
              time: "07:10",
              title: "Wave start",
              note: "Transition closes 06:40.",
              link: { page: "2f4c8a1e-6b30-4d7a-9c15-8e0b3d5a7f21" },
            },
          ],
        },
        children: [],
      },

      /* ---- navigation ------------------------------------------------- */

      "race-registration": {
        type: "link-button",
        props: {
          label: "Race registration",
          url: "https://example.org/olympic-tri-2026/registration",
        },
        children: [],
      },

      "coach-note": {
        type: "callout",
        props: {
          text: "If Thursday's brick hurts, drop Friday's run, not the long ride.",
          tone: "tip",
        },
        children: [],
      },
    },
  },
};
