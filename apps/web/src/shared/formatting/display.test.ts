import { describe, expect, it } from "vitest";

import {
  formatAbsoluteDate,
  formatAbsoluteDateTime,
  formatDisplayValue,
  formatPartialIsoDate,
  formatPercent,
  isIsoDate,
  isIsoDateTime,
  isPartialIsoDate,
  STRATA_DIRECTIVES,
} from "./display";

describe("partial publication dates", () => {
  it("recognises a bare year and a year-month, and nothing looser", () => {
    expect(isPartialIsoDate("2019")).toBe(true);
    expect(isPartialIsoDate("2019-06")).toBe(true);
    expect(isPartialIsoDate("2019-13")).toBe(false);
    expect(isPartialIsoDate("2019-06-12")).toBe(false);
    expect(isPartialIsoDate("19")).toBe(false);
  });

  it("renders a year as itself and a year-month as month + year", () => {
    expect(formatPartialIsoDate("2019")).toBe("2019");
    expect(formatPartialIsoDate("2019-06")).toBe("Jun 2019");
    expect(formatPartialIsoDate("2019-12")).toBe("Dec 2019");
  });
});

const NEW_YORK = {
  locale: "en-US",
  timeZone: "America/New_York",
  now: Date.parse("2026-08-21T12:00:00-07:00"),
} as const;

describe("formatDisplayValue", () => {
  it("falls back to an exact date once a relative label stops locating the fact", () => {
    // Past a month, relative labels fall back to a date in the viewer's timezone.
    expect(
      formatDisplayValue("2025-07-04T19:00:00Z", NEW_YORK),
    ).toBe("Jul 4, 2025");
    expect(
      formatDisplayValue("2025-07-04T19:00:00Z", { ...NEW_YORK, locale: "ja-JP" }),
    ).toBe("2025/07/04");
  });

  it("never timezone-shifts a calendar date", () => {
    const date = "2026-08-19";
    expect(formatDisplayValue(date, { ...NEW_YORK, timeZone: "America/Los_Angeles" }))
      .toBe("Wed, Aug 19");
    expect(formatDisplayValue(date, { ...NEW_YORK, timeZone: "Asia/Tokyo" }))
      .toBe("Wed, Aug 19");
  });

  it("does not Date.parse random strings", () => {
    expect(formatDisplayValue("not-a-date")).toBe("not-a-date");
    expect(isIsoDate("2026-08-19T09:14:00-07:00")).toBe(false);
    expect(isIsoDateTime("2026-08-19")).toBe(false);
    expect(isIsoDateTime("2026-08-19T09:14:00-07:00")).toBe(true);
    // zod's iso.datetime accepts minute precision, so the renderer must too.
    expect(isIsoDateTime("2026-08-19T09:14-07:00")).toBe(true);
  });
});

describe("host formatting environment", () => {
  const instant = "2026-08-21T19:00:00Z";

  it("renders an exact instant in the viewer timezone", () => {
    expect(formatAbsoluteDate(instant, NEW_YORK)).toBe("Aug 21, 2026");
    expect(formatAbsoluteDateTime(instant, NEW_YORK)).toBe("Aug 21, 2026, 3:00 PM");
    expect(formatAbsoluteDateTime(instant, { ...NEW_YORK, timeZone: "Asia/Tokyo" }))
      .toBe("Aug 22, 2026, 4:00 AM");
  });

  it("renders a ratio as a whole percent", () => {
    expect(formatPercent(0.775, NEW_YORK)).toBe("78%");
  });

  it("registers only the format directive", () => {
    expect(STRATA_DIRECTIVES.map((directive) => directive.name)).toEqual(["$format"]);
  });

  it("reuses one Intl formatter across values that share a locale and options", () => {
    const NumberFormat = Intl.NumberFormat;
    let constructed = 0;
    Intl.NumberFormat = function CountingNumberFormat(
      locale?: string,
      options?: Intl.NumberFormatOptions,
    ) {
      constructed += 1;
      return new NumberFormat(locale, options);
    } as unknown as typeof Intl.NumberFormat;

    try {
      for (let value = 0; value < 50; value += 1) {
        expect(formatDisplayValue(value, { locale: "fr-FR" })).toBe(String(value));
      }
    } finally {
      Intl.NumberFormat = NumberFormat;
    }

    expect(constructed).toBe(1);
  });
});
