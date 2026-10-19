import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FormatEnvironment } from "./display";
import {
  FixedViewerFormattingProvider,
  FormattedValue,
  LocalDateTime,
} from "./viewer";

const NEW_YORK: FormatEnvironment = {
  locale: "en-US",
  timeZone: "America/New_York",
  now: Date.parse("2026-08-24T12:00:00-04:00"),
};

function renderIn(
  environment: FormatEnvironment,
  child: React.ReactNode,
): string {
  return renderToStaticMarkup(
    <FixedViewerFormattingProvider environment={environment}>
      {child}
    </FixedViewerFormattingProvider>,
  );
}

describe("viewer formatting", () => {
  it("keeps the machine-readable instant while showing local exact time", () => {
    const iso = "2026-08-21T19:00:00Z";
    const html = renderIn(NEW_YORK, <LocalDateTime value={iso} />);

    expect(html).toContain(`dateTime="${iso}"`);
    expect(html).toContain("Aug 21, 2026, 3:00 PM");
  });

  it("changes an instant, but not a calendar date, with viewer timezone", () => {
    const tokyo = { ...NEW_YORK, timeZone: "Asia/Tokyo" };

    expect(renderIn(tokyo, <LocalDateTime value="2026-08-21T19:00:00Z" />))
      .toContain("Aug 22, 2026, 4:00 AM");
    expect(renderIn(tokyo, <FormattedValue value="2026-08-21" />))
      .toContain("Fri, Aug 21");
  });

  it("gives relative instants an exact local-time title", () => {
    const iso = "2026-08-24T15:00:00Z";
    const html = renderIn(NEW_YORK, <FormattedValue value={iso} />);

    expect(html).toContain("1 hour ago");
    expect(html).toContain('title="Aug 24, 2026, 11:00 AM"');
    expect(html).toContain(`dateTime="${iso}"`);
  });
});
