/**
 * A page within every structural cap in `limits.ts` (20 elements, depth 3, 18 KB) that is still a
 * text wall: thousands of characters across seven facts blocks. The text-budget tests expect a refusal.
 * Kept out of the reference fixtures because the dev fixture route renders all of those.
 */
import type { StrataSpec } from "@/page-content/schema";

export const textWall = {
  "root": "root",
  "elements": {
    "part-a": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-1",
            "label": "Commute",
            "value": "The north side has the shortest commute, about twenty minutes by train to the office. Rents on the east side run about ten percent lower, but most listings are older walk-ups. Two buildings near the park allow pets and include laundry, which narrows the list quickly."
          },
          {
            "id": "item-2",
            "label": "Rent range",
            "value": "The weekend market and the library branch make the riverside blocks easy to live in. Street parking is tight after six in the evening, so a garage spot adds to the monthly cost."
          },
          {
            "id": "item-3",
            "label": "Pets and laundry",
            "value": "Rents are steady. Two viewings are booked."
          },
          {
            "id": "item-4",
            "label": "Neighborhood feel",
            "value": "Grocery options are good everywhere, though the late-night choices cluster near the station."
          },
          {
            "id": "item-5",
            "label": "Parking",
            "value": "Parking is tight. The commute is short."
          }
        ]
      },
      "children": []
    },
    "lead": {
      "type": "prose",
      "props": {
        "text": "Noise from the main avenue is the most common complaint in reviews of the corner units. Lease terms are mostly twelve months; two landlords offered a one-month discount for longer."
      },
      "children": []
    },
    "part-b": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-6",
            "label": "Groceries",
            "value": "The school district boundary splits the neighborhood, which matters for resale more than rent."
          },
          {
            "id": "item-7",
            "label": "Noise",
            "value": "Pets are allowed. Laundry is in the building."
          },
          {
            "id": "item-8",
            "label": "Lease terms",
            "value": "Bike lanes connect the west side to downtown, and the route is mostly flat along the water."
          },
          {
            "id": "item-9",
            "label": "Schools",
            "value": "Two viewings are booked for Saturday morning, with a third pending a reply from the agent."
          },
          {
            "id": "item-10",
            "label": "Getting around",
            "value": "The park is close. Noise is the main risk."
          },
          {
            "id": "item-11",
            "label": "Viewings",
            "value": "Utilities are included in one listing, which makes its higher rent closer to the others."
          }
        ]
      },
      "children": []
    },
    "part-c": {
      "type": "reference-list",
      "props": {
        "items": [
          {
            "id": "item-12",
            "url": "https://example.com/research/1",
            "note": "Rents are steady. Two viewings are booked.",
            "title": "Where we are looking",
            "source": "Example Research"
          },
          {
            "id": "item-13",
            "url": "https://example.com/research/2",
            "note": "Parking is tight. The commute is short.",
            "title": "What stands out",
            "source": "Example Research"
          },
          {
            "id": "item-14",
            "url": "https://example.com/research/3",
            "note": "Pets are allowed.",
            "title": "Tradeoffs",
            "source": "Example Research"
          },
          {
            "id": "item-15",
            "url": "https://example.com/research/4",
            "note": "The park is close. Noise is the main risk.",
            "title": "Open questions",
            "source": "Example Research"
          },
          {
            "id": "item-16",
            "url": "https://example.com/research/5",
            "note": "Rents are steady.",
            "title": "Sources",
            "source": "Example Research"
          },
          {
            "id": "item-17",
            "url": "https://example.com/research/6",
            "note": "The north side has the shortest commute, about twenty minutes by train to the office.",
            "title": "How this was gathered",
            "source": "Example Research",
            "published_at": "Parking is"
          },
          {
            "id": "item-18",
            "url": "https://example.com/research/7",
            "note": "The commute is short. Pets are allowed. Laundry is in the building.",
            "title": "Next steps",
            "source": "Example Research"
          }
        ]
      },
      "children": []
    },
    "root": {
      "type": "section",
      "props": {},
      "children": [
        "lead",
        "part-d",
        "part-e",
        "part-f",
        "part-g",
        "part-h",
        "part-i"
      ]
    },
    "part-j": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-19",
            "label": "Utilit",
            "value": "Rents on the east side run about ten percent lower, but most listings are older walk-ups."
          },
          {
            "id": "item-20",
            "label": "Commut",
            "value": "Two buildings near the park allow pets and include laundry, which narrows the list quickly."
          },
          {
            "id": "item-21",
            "label": "Rent ran",
            "value": "The weekend market and the library branch make the riverside blocks easy to live in."
          },
          {
            "id": "item-22",
            "label": "Pets and",
            "value": "Street parking is tight after six in the evening, so a garage spot adds to the monthly cost."
          },
          {
            "id": "item-23",
            "label": "Neighborh",
            "value": "Grocery options are good everywhere, though the late-night choices cluster near the station."
          },
          {
            "id": "item-24",
            "label": "Parkin",
            "value": "Noise from the main avenue is the most common complaint in reviews of the corner units. Lease terms are mostly twelve months; two landlords offered a one-month discount for longer."
          },
          {
            "id": "item-25",
            "label": "Groceries",
            "value": "The school district boundary splits the neighborhood, which matters for resale more than rent. Bike lanes connect the west side to downtown, and the route is mostly flat along the water."
          }
        ]
      },
      "children": []
    },
    "part-k": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-26",
            "label": "Noise",
            "value": "Two viewings are booked for Saturday morning, with a third pending a reply from the agent."
          },
          {
            "id": "item-27",
            "label": "Lease terms",
            "value": "Utilities are included in one listing, which makes its higher rent closer to the others. The north side has the shortest commute, about twenty minutes by train to the office."
          },
          {
            "id": "item-28",
            "label": "Schools",
            "value": "Rents on the east side run about ten percent lower, but most listings are older walk-ups."
          },
          {
            "id": "item-29",
            "label": "Getting around",
            "value": "Two buildings near the park allow pets and include laundry, which narrows the list quickly."
          }
        ]
      },
      "children": []
    },
    "part-l": {
      "type": "checklist",
      "props": {
        "items": [
          {
            "id": "item-30",
            "done": false,
            "label": "The weekend market and the library branch make the riverside blocks easy to live in. Street parking is tight after six in the evening, so a garage spot adds to the monthly cost."
          },
          {
            "id": "item-31",
            "done": false,
            "label": "Grocery options are good everywhere, though the late-night choices cluster near the station."
          }
        ]
      },
      "children": []
    },
    "part-m": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-32",
            "label": "Viewings",
            "value": "Noise from the main avenue is the most common complaint in reviews of the corner units."
          },
          {
            "id": "item-33",
            "label": "Utilities",
            "value": "Lease terms are mostly twelve months; two landlords offered a one-month discount for longer."
          },
          {
            "id": "item-34",
            "label": "Commute",
            "value": "The school district boundary splits the neighborhood, which matters for resale more than rent."
          },
          {
            "id": "item-35",
            "label": "Rent range",
            "value": "Bike lanes connect the west side to downtown, and the route is mostly flat along the water. Two viewings are booked for Saturday morning, with a third pending a reply from the agent."
          },
          {
            "id": "item-36",
            "label": "Pets and laundry",
            "value": "Utilities are included in one listing, which makes its higher rent closer to the others. The north side has the shortest commute, about twenty minutes by train to the office."
          },
          {
            "id": "item-37",
            "label": "Neighborhood feel",
            "value": "Rents on the east side run about ten percent lower, but most listings are older walk-ups."
          }
        ]
      },
      "children": []
    },
    "part-n": {
      "type": "callout",
      "props": {
        "text": "Two buildings near the park allow pets and include laundry, which narrows the list quickly. The weekend market and the library branch make the riverside blocks easy to live in. Street parking is tight after six in the evening, so a garage spot adds to the monthly cost.",
        "tone": "note"
      },
      "children": []
    },
    "part-f": {
      "type": "section",
      "props": {
        "title": "What it means for the move"
      },
      "children": [
        "part-o",
        "part-p",
        "part-q"
      ]
    },
    "part-g": {
      "type": "section",
      "props": {
        "title": "Where we are looking"
      },
      "children": [
        "part-a"
      ]
    },
    "part-h": {
      "type": "section",
      "props": {
        "title": "What stands out"
      },
      "children": [
        "part-b"
      ]
    },
    "part-e": {
      "type": "section",
      "props": {
        "title": "Tradeoffs"
      },
      "children": [
        "part-r",
        "part-j"
      ]
    },
    "part-p": {
      "type": "callout",
      "props": {
        "text": "Grocery options are good everywhere, though the late-night choices cluster near the station. Noise from the main avenue is the most common complaint in reviews of the corner units. Lease terms are mostly twelve months; two landlords offered a one-month discount for longer.",
        "tone": "note"
      },
      "children": []
    },
    "part-i": {
      "type": "section",
      "props": {
        "title": "Open questions"
      },
      "children": [
        "part-n",
        "part-c"
      ]
    },
    "part-r": {
      "type": "prose",
      "props": {
        "text": "The school district boundary splits the neighborhood, which matters for resale more than rent. Bike lanes connect the west side to downtown, and the route is mostly flat along the water."
      },
      "children": []
    },
    "part-d": {
      "type": "section",
      "props": {
        "title": "Sources"
      },
      "children": [
        "part-m",
        "part-k",
        "part-l"
      ]
    },
    "part-q": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-38",
            "label": "Parking",
            "value": "Two viewings are booked for Saturday morning, with a third pending a reply from the agent."
          },
          {
            "id": "item-39",
            "label": "Groceries",
            "value": "Utilities are included in one listing, which makes its higher rent closer to the others."
          },
          {
            "id": "item-40",
            "label": "Noise",
            "value": "The north side has the shortest commute, about twenty minutes by train to the office. Rents on the east side run about ten percent lower, but most listings are older walk-ups."
          }
        ]
      },
      "children": []
    },
    "part-o": {
      "type": "facts",
      "props": {
        "items": [
          {
            "id": "item-41",
            "label": "Lease terms",
            "value": "Two buildings near the park allow pets and include laundry, which narrows the list quickly. The weekend market and the library branch make the riverside blocks easy to live in."
          },
          {
            "id": "item-42",
            "label": "Schools",
            "value": "Street parking is tight after six in the evening, so a garage spot adds to the monthly cost."
          },
          {
            "id": "item-43",
            "label": "Getting around",
            "value": "Grocery options are good everywhere, though the late-night choices cluster near the station. Noise from the main avenue is the most common complaint in reviews of the corner units. Lease terms are mostly twelve months; two landlords offered a one-month discount for longer."
          }
        ]
      },
      "children": []
    }
  }
} as unknown as StrataSpec;
