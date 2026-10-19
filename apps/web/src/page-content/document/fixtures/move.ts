/**
 * Fixture: an apartment move. Covers prose, facts, decision, approval, attachment-list,
 * timeline, the remaining card shapes (cover, grid, carousel) and a root-level `sequence`.
 */
import type { StrataSpec } from "@/page-content/schema";
import type { Meta } from "@/page-content/document/types";

type PageFixture = { meta: Meta; spec: StrataSpec };

export const move: PageFixture = {
  meta: {
    title: "Brooklyn move",
    slug: "brooklyn-move",
    kind: "living",
    source_event: {
      id: "msg_move_01",
      at: "2026-08-23T17:10:00-04:00",
      excerpt: "keep the apartment move on track",
    },
    url: "/share/pgk_example-move-key",
    written_registry_version: 13,
    created_at: "2026-08-23T17:10:08-04:00",
    updated_at: "2026-08-24T09:35:00-04:00",
  },
  spec: {
    answer: {
      verdict: "Lease signed and the move is set for Sep 14; the internet install window is waiting on you.",
    },
    root: "brooklyn-move",
    // Page ids from other fixtures; tests check the shape, not resolution.
    sequence: {
      up: { page: "2f4c8a1e-6b30-4d7a-9c15-8e0b3d5a7f21" },
      previous: { page: "5d1a6c9e-7b2f-4e3a-9c10-2f6a8b4d0c17" },
    },
    elements: {
      "brooklyn-move": {
        type: "section",
        props: {},
        children: [
          // prose may not be the first child.
          "move-day",
          "move-summary",
          "apartment-cover",
          "move-at-a-glance",
          "lease-decision",
          "rent-comparison",
          "mover-quotes",
          "internet-approval",
          "move-documents",
          "move-nearby",
          "move-history",
        ],
      },
      "apartment-cover": {
        type: "card",
        props: {
          title: "The new apartment",
          media: { resource_id: "move-apartment-photo", alt: "Living room at Maple Street, facing the bay window" },
        },
        children: [],
      },
      "mover-quotes": {
        type: "carousel",
        props: {},
        children: ["quote-metro", "quote-cityline", "quote-bergen"],
      },
      "quote-metro": {
        type: "card",
        props: { title: "Metro Movers", footer: "$1,850" },
        children: [],
      },
      "quote-cityline": {
        type: "card",
        props: { title: "City Line Movers", footer: "$1,200" },
        children: [],
      },
      "quote-bergen": {
        type: "card",
        props: { title: "Bergen Movers", footer: "$2,400" },
        children: [],
      },
      "move-nearby": {
        type: "grid",
        props: {},
        children: ["nearby-coffee", "nearby-grocery", "nearby-gym"],
      },
      "nearby-coffee": {
        type: "card",
        props: { title: "Onda Coffee", footer: "3 min walk" },
        children: [],
      },
      "nearby-grocery": {
        type: "card",
        props: { title: "Key Food", footer: "24 hours" },
        children: [],
      },
      "nearby-gym": {
        type: "card",
        props: { title: "Bergen St Fitness", footer: "$45/mo" },
        children: [],
      },
      "move-day": {
        type: "metric",
        props: { label: "Move-in", value: "2026-09-14" },
        children: [],
      },
      "move-summary": {
        type: "prose",
        props: {
          text: "The lease is signed and the move is on track for September 14. The only thing waiting on you is which internet install window to book.\n\nThe movers and elevator are confirmed; the building needs the insurance certificate by Friday.",
        },
        children: [],
      },
      "move-at-a-glance": {
        type: "section",
        props: { title: "At a glance" },
        children: ["move-details"],
      },
      "move-details": {
        type: "facts",
        props: {
          items: [
            {
              id: "elevator",
              label: "Freight elevator",
              value: "Reserved from 9:00 AM to noon; the building requires padded walls.",
            },
            {
              id: "insurance",
              label: "Insurance certificate",
              value: "Mover is sending it directly to the building manager by Friday.",
            },
          ],
        },
        children: [],
      },
      "lease-decision": {
        type: "decision",
        props: {
          question: "Which apartment did we choose?",
          options: [
            {
              id: "bergen",
              label: "Maple Street",
              tradeoff: "Best balance of quiet, laundry, and commute.",
            },
            {
              id: "carroll",
              label: "Carroll Street",
              tradeoff: "$125 less each month, with more street noise.",
            },
            {
              id: "bond",
              label: "Bond Street",
              tradeoff: "Shortest commute, but $250 over the monthly ceiling.",
            },
          ],
          chosen_id: "bergen",
          rationale: "Maple Street kept the bedroom quiet without stretching the budget.",
        },
        children: [],
      },
      "rent-comparison": {
        type: "comparison",
        props: {
          items: [
            { id: "rent", label: "Rent", before: "$1,950/mo", after: "$2,150/mo" },
            { id: "commute", label: "Commute", before: "35 min", after: "12 min" },
          ],
          before_label: "Old place",
          after_label: "Maple Street",
        },
        children: [],
      },
      "internet-approval": {
        type: "approval",
        props: {
          id: "internet-install",
          question: "Which internet install should I book?",
          context: "Both windows are still available. The morning slot avoids your first workday in the apartment.",
          options: [
            { id: "saturday-morning", label: "Saturday, 8–11 AM" },
            { id: "monday-afternoon", label: "Monday, 1–4 PM" },
          ],
        },
        children: [],
      },
      "move-documents": {
        type: "attachment-list",
        props: {
          items: [
            {
              id: "floor-plan",
              resource_id: "move-floor-plan",
              label: "Maple Street floor plan",
              kind: "image",
              media_type: "image/svg+xml",
              size_bytes: 6184,
            },
            {
              id: "lease",
              resource_id: "move-lease",
              label: "Signed lease.pdf",
              kind: "document",
              media_type: "application/pdf",
              size_bytes: 1482000,
            },
          ],
        },
        children: [],
      },
      "move-history": {
        type: "timeline",
        props: {
          order: "descending",
          events: [
            {
              id: "lease-signed",
              at: "2026-08-23T16:42:00-04:00",
              title: "Lease signed",
              note: "Countersigned copy saved with the move documents.",
            },
            {
              id: "movers-confirmed",
              at: "2026-08-22T11:15:00-04:00",
              title: "Movers confirmed",
              note: "Arrival window is 8:30–9:00 AM.",
            },
            {
              id: "application-approved",
              at: "2026-08-20T14:05:00-04:00",
              title: "Application approved",
            },
          ],
        },
        children: [],
      },
    },
  },
};
