/**
 * Fixture: a six-day Lisbon trip. Covers a carousel of day timelines, grid and records tables,
 * copyable facts, a comparison and a dated item-list. All dates are typed values.
 */
import type { StrataSpec } from "@/page-content/schema";
import type { Meta } from "@/page-content/document/types";

type PageFixture = { meta: Meta; spec: StrataSpec };

export const trip: PageFixture = {
  meta: {
    title: "Lisbon",
    slug: "lisbon-september",
    kind: "living",
    source_event: {
      id: "msg_01j9x2r6b4d0nk",
      at: "2026-08-16T18:41:00-07:00",
      excerpt: "book me something for Lisbon in September",
    },
    url: "/share/pgk_h4mtx9cw6plq2ry8",
    written_registry_version: 13,
    created_at: "2026-08-16T18:41:35-07:00",
    updated_at: "2026-08-20T11:26:04-07:00",
  },
  spec: {
    answer: {
      verdict: "Six nights in Alfama from Sep 12. Flights held on TAP but not ticketed - the fare expires Friday.",
    },
    root: "lisbon-trip",
    elements: {
      "lisbon-trip": {
        type: "section",
        props: {},
        children: [
          "departure",
          "nightly-rate",
          "trip-note",
          "bookings",
          "flight-choice",
          "itinerary",
          "metro-and-wifi",
          "packing-list",
          "excursion-addons",
          "dining",
          "weather",
          "host-quote",
          "faq",
          "flight-check-in",
        ],
      },

      "trip-note": {
        type: "callout",
        props: {
          text: "Six nights, Alfama. Held, not ticketed — fare expires Friday.",
          tone: "note",
        },
        children: [],
      },

      "departure": {
        type: "metric",
        props: { label: "Departure", value: "2026-09-12" },
        children: [],
      },
      "nightly-rate": {
        type: "metric",
        props: {
          label: "Nightly rate",
          value: { amount: 142, currency: "EUR" },
        },
        children: [],
      },

      /* ---- the copy targets ------------------------------------------- */

      "bookings": {
        type: "section",
        props: { title: "Bookings" },
        children: ["flight-refs", "stay-refs"],
      },
      "flight-refs": {
        type: "facts",
        props: {
          presentation: "inline",
          items: [
            { id: "airline", label: "Airline", value: "TAP Portugal", copyable: false },
            { id: "record-locator", label: "Record locator", value: "ABC123", copyable: true },
            { id: "ticket-number", label: "Ticket", value: "000-0000000000", copyable: true },
            { id: "seats", label: "Seats", value: "14A, 14B", copyable: true },
          ],
        },
        children: [],
      },
      // The address exceeds the 40-character inline threshold.
      "stay-refs": {
        type: "facts",
        props: {
          presentation: "stacked",
          items: [
            {
              id: "hotel",
              label: "Hotel",
              value: "Casa do Beco, Rua dos Remédios 142, Alfama",
              copyable: false,
            },
            { id: "reservation", label: "Reservation", value: "RES-00000", copyable: true },
            { id: "check-in", label: "Check-in", value: "2026-09-12", copyable: false },
            { id: "check-out", label: "Check-out", value: "2026-09-18", copyable: false },
            { id: "door-code", label: "Door code", value: "1234#", copyable: true },
          ],
        },
        children: [],
      },

      /* ---- the comparison --------------------------------------------- */

      "flight-choice": {
        type: "section",
        props: { title: "Flights" },
        children: ["flight-options", "flight-note", "fare-watch"],
      },
      // Options are columns, so `highlight_column` marks the pick. Pinned to `grid`, since four
      // columns would otherwise default to `records` on a phone.
      "flight-options": {
        type: "table",
        props: {
          presentation: "grid",
          columns: ["", "TAP 1049", "United 907", "Iberia 3421"],
          highlight_column: 1,
          rows: [
            {
              id: "price",
              cells: [
                "Price",
                { amount: 412, currency: "USD" },
                { amount: 503, currency: "USD" },
                { amount: 389, currency: "USD" },
              ],
            },
            {
              id: "duration",
              cells: [
                "Duration",
                { value: 6.75, unit: "h" },
                { value: 7.5, unit: "h" },
                { value: 11.25, unit: "h" },
              ],
            },
            { id: "stops", cells: ["Stops", 0, 0, 1] },
            { id: "arrives", cells: ["Arrives", "14:05", "16:40", "21:15"] },
            {
              id: "seat-pitch",
              cells: [
                "Pitch",
                { value: 31, unit: "in" },
                { value: 31, unit: "in" },
                { value: 30, unit: "in" },
              ],
            },
          ],
        },
        children: [],
      },
      "flight-note": {
        type: "callout",
        props: {
          text: "Iberia is $23 cheaper but 4.5 hours longer, via Madrid. Taking TAP.",
          tone: "tip",
        },
        children: [],
      },
      "fare-watch": {
        type: "comparison",
        props: {
          before_label: "Monday",
          after_label: "Today",
          items: [
            { id: "fare", label: "TAP fare", before: "$398", after: "$412" },
            { id: "seats-left", label: "Seats left", before: "6", after: "2" },
          ],
        },
        children: [],
      },

      /* ---- the itinerary ---------------------------------------------- */

      "itinerary": {
        type: "section",
        props: { title: "Itinerary" },
        children: ["days"],
      },
      "days": {
        type: "carousel",
        props: {},
        children: ["arrival-day", "alfama-day", "sintra-day"],
      },
      "arrival-day": {
        type: "card",
        props: { title: "12 · Arrival" },
        children: ["arrival-events"],
      },
      "alfama-day": {
        type: "card",
        props: { title: "13 · Alfama" },
        children: ["alfama-events"],
      },
      "sintra-day": {
        type: "card",
        props: { title: "14 · Sintra" },
        children: ["sintra-events"],
      },
      "arrival-events": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            {
              id: "landing",
              at: "2026-09-12",
              time: "14:05",
              title: "Land at LIS",
              place: "LIS Terminal 1",
              ref: "TAP 1049",
            },
            {
              id: "hotel-check-in",
              at: "2026-09-12",
              time: "16:00",
              title: "Check in",
              place: "Casa do Beco",
              ref: "RES-00000",
            },
            {
              id: "arrival-dinner",
              at: "2026-09-12",
              time: "20:30",
              title: "Dinner",
              place: "Taberna das Flores",
            },
          ],
        },
        children: [],
      },
      "alfama-events": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            {
              id: "castle",
              at: "2026-09-13",
              time: "09:30",
              title: "São Jorge Castle",
              place: "Alfama",
              ref: "Timed entry",
            },
            {
              id: "tram-28",
              at: "2026-09-13",
              time: "12:00",
              title: "Tram 28 to Graça",
            },
            {
              id: "fado",
              at: "2026-09-13",
              time: "21:00",
              title: "Fado at Mesa de Frades",
              place: "Alfama",
              ref: "Table for 2",
            },
          ],
        },
        children: [],
      },
      "sintra-events": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            {
              id: "train-to-sintra",
              at: "2026-09-14",
              time: "08:12",
              title: "Train from Rossio",
              place: "Rossio station",
              ref: "Sintra line",
            },
            {
              id: "pena-palace",
              at: "2026-09-14",
              time: "10:00",
              title: "Pena Palace",
              place: "Sintra",
              ref: "Timed entry",
            },
            {
              id: "quinta-da-regaleira",
              at: "2026-09-14",
              time: "14:30",
              title: "Quinta da Regaleira",
              place: "Sintra",
            },
            {
              id: "train-back",
              at: "2026-09-14",
              time: "18:40",
              title: "Return train",
            },
          ],
        },
        children: [],
      },

      /* ---- on the ground ---------------------------------------------- */

      "metro-and-wifi": {
        type: "facts",
        props: {
          items: [
            { id: "metro-card", label: "Navegante card", value: "0000 0000 0000", copyable: true },
            { id: "apartment-wifi", label: "Apartment Wi-Fi", value: "guest-network / example-password", copyable: true },
            { id: "emergency", label: "Emergency", value: "112", copyable: true },
          ],
        },
        children: [],
      },
      "packing-list": {
        type: "item-list",
        props: {
          items: [
            { id: "adapter", title: "EU power adapter", description: "Packed" },
            { id: "rain-shell", title: "Rain shell", description: "Pending, for Sintra rain" },
            { id: "gift", title: "Host gift", value: { amount: 25, currency: "EUR" } },
          ],
        },
        children: [],
      },
      // Every row has `on`, so rows group by day. One external link, one page link, one plain.
      "excursion-addons": {
        type: "item-list",
        props: {
          items: [
            {
              id: "castle-timed-entry",
              title: "Castle entry",
              description: "Skip the line, optional",
              value: { amount: 15, currency: "EUR" },
              on: "2026-09-13",
              link: { url: "https://example.com/castelo-sao-jorge/tickets" },
            },
            {
              id: "fado-table",
              title: "Fado table",
              description: "Booked, 21:00",
              on: "2026-09-13",
            },
            {
              id: "pena-palace-entry",
              title: "Palace entry",
              description: "Booked",
              value: { amount: 20, currency: "EUR" },
              on: "2026-09-14",
              link: { page: "5d1a6c9e-7b2f-4e3a-9c10-2f6a8b4d0c17" },
            },
          ],
        },
        children: [],
      },
      "dining": {
        type: "section",
        props: { title: "Dining" },
        children: ["dinner-picks"],
      },
      "dinner-picks": {
        type: "table",
        props: {
          presentation: "records",
          key_column: "Restaurant",
          columns: ["Restaurant", "Cuisine", "Price", "Reservation"],
          rows: [
            {
              id: "flores",
              cells: ["Taberna das Flores", "Portuguese", { amount: 32, currency: "EUR" }, "Walk-in"],
            },
            {
              id: "belcanto",
              cells: ["Belcanto", "Fine dining", { amount: 165, currency: "EUR" }, "RES-8842"],
            },
            {
              id: "frades",
              cells: ["Mesa de Frades", "Fado & petiscos", { amount: 45, currency: "EUR" }, "Table for 2"],
            },
          ],
        },
        children: [],
      },
      "weather": {
        type: "callout",
        props: {
          text: "Rain forecast for the 14th — may swap Sintra and Alfama.",
          tone: "warning",
        },
        children: [],
      },

      "host-quote": {
        type: "quote",
        props: {
          text: "Best Alfama morning: no plan before coffee.",
          attribution: "Mariana, Casa do Beco",
        },
        children: [],
      },
      "faq": {
        type: "accordion",
        props: {
          items: [
            { id: "faq-towels", title: "Towels and linen", body: "Provided; spares in hallway chest." },
            { id: "faq-checkout", title: "Late checkout", body: "Until 1pm if unbooked; ask ahead." },
          ],
        },
        children: [],
      },

      /* ---- navigation -------------------------------------------------- */

      "flight-check-in": {
        type: "link-button",
        props: { label: "TAP check-in", url: "https://example.com/tap/check-in/ABC123" },
        children: [],
      },
    },
  },
};
