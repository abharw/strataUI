import { describe, expect, it } from "vitest";

import { move, triathlon, trip } from "@/page-content/document/fixtures";
import {
  EmptySchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LinkSchema,
  MoneySchema,
  PageIdSchema,
  presentation,
  QuantitySchema,
} from "./types";

describe("fixtures", () => {
  it("have a root and children that all resolve", () => {
    // The schema does not check referential integrity, but fixtures must satisfy it.
    for (const doc of [triathlon, trip, move]) {
      expect(doc.spec.elements[doc.spec.root]).toBeDefined();
      for (const element of Object.values(doc.spec.elements)) {
        for (const child of element.children ?? []) {
          expect(doc.spec.elements[child]).toBeDefined();
        }
      }
    }
  });
});

describe("typed values", () => {
  it("accepts a quantity with and without a unit", () => {
    expect(QuantitySchema.parse({ value: 8.5, unit: "h" })).toEqual({ value: 8.5, unit: "h" });
    expect(QuantitySchema.parse({ value: 3 })).toEqual({ value: 3 });
    expect(QuantitySchema.safeParse({ value: Number.NaN }).success).toBe(false);
  });

  it("requires an ISO 4217 code on money, in whatever case it arrives", () => {
    expect(MoneySchema.parse({ amount: 412, currency: "USD" })).toEqual({
      amount: 412,
      currency: "USD",
    });
    // Lowercase codes are upper-cased, not refused.
    expect(MoneySchema.parse({ amount: 412, currency: "usd" })).toEqual({
      amount: 412,
      currency: "USD",
    });
    expect(MoneySchema.parse({ amount: 9, currency: "eUr" }).currency).toBe("EUR");
    for (const currency of ["dollars", "US$", "us$", "eu", "USDT", " usd"]) {
      expect(MoneySchema.safeParse({ amount: 412, currency }).success).toBe(false);
    }
    expect(MoneySchema.safeParse({ amount: 412, currency: "US$" }).error?.issues[0]?.message).toBe(
      "expected an ISO 4217 code, e.g. USD",
    );
  });

  it("holds dates to YYYY-MM-DD and datetimes to an explicit offset", () => {
    expect(IsoDateSchema.parse("2026-10-04")).toBe("2026-10-04");
    expect(IsoDateSchema.safeParse("2026-10-04T00:00:00Z").success).toBe(false);
    expect(IsoDateSchema.safeParse("2026-13-01").success).toBe(false);

    expect(IsoDateTimeSchema.parse("2026-08-19T09:14:00-07:00")).toBe("2026-08-19T09:14:00-07:00");
    expect(IsoDateTimeSchema.parse("2026-08-19T16:14:00Z")).toBe("2026-08-19T16:14:00Z");
    // A datetime without an offset has no instant.
    expect(IsoDateTimeSchema.safeParse("2026-08-19T09:14:00").success).toBe(false);
  });

  it("takes a page id at any uuid version, and nothing else", () => {
    // Any version, matching the API's other id checks.
    expect(PageIdSchema.parse("3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455"))
      .toBe("3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455");
    expect(PageIdSchema.safeParse("00000000-0000-0000-0000-000000000000").success).toBe(true);
    expect(PageIdSchema.safeParse("3C7E5B90-1A44-4D62-8F0B-9AD2E6C71455").success).toBe(true);
    expect(PageIdSchema.safeParse("3c7e5b90-1a44-4d62-8f0b").success).toBe(false);
    expect(PageIdSchema.safeParse("not-a-page-id").success).toBe(false);
  });
});

describe("catalog v2 cross-cutting values", () => {
  it("LinkSchema takes exactly one of page or url", () => {
    expect(LinkSchema.safeParse({ page: "3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455" }).success).toBe(true);
    expect(LinkSchema.safeParse({ url: "https://example.com/x" }).success).toBe(true);
    expect(LinkSchema.safeParse({}).success).toBe(false);
    expect(LinkSchema.safeParse({ page: "3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455", url: "https://example.com/x" }).success)
      .toBe(false);
    expect(LinkSchema.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("EmptySchema is a short non-empty sentence", () => {
    expect(EmptySchema.safeParse("No workouts logged yet.").success).toBe(true);
    expect(EmptySchema.safeParse("").success).toBe(false);
    expect(EmptySchema.safeParse("x".repeat(81)).success).toBe(false);
  });

  it("presentation() builds a nullable enum defaulting to null", () => {
    const schema = presentation(["bar", "ring"]);
    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse(null)).toBeNull();
    expect(schema.parse("bar")).toBe("bar");
    expect(schema.safeParse("donut").success).toBe(false);
  });
});
