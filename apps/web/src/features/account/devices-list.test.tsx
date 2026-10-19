import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(owner)/home/actions", () => ({
  revokeDevice: vi.fn(),
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { OwnerSessionSummary } from "@/server/auth/owner-session";

import { DevicesList } from "./devices-list";

const sessions: OwnerSessionSummary[] = [
  {
    id: "session-current",
    current: true,
    client_label: "Chrome on Mac",
    created_at: "2026-08-24T14:30:00.000Z",
    last_used_at: "2026-08-28T13:06:00.000Z",
    revoked_at: null,
  },
  {
    id: "session-phone",
    current: false,
    client_label: "Safari on iPhone",
    created_at: "2026-08-19T18:12:00.000Z",
    last_used_at: "2026-08-27T20:11:00.000Z",
    revoked_at: null,
  },
  {
    id: "session-old",
    current: false,
    client_label: null,
    created_at: "2026-07-02T09:00:00.000Z",
    last_used_at: null,
    revoked_at: "2026-08-21T09:00:00.000Z",
  },
];

describe("the Devices list", () => {
  it("names each browser coarsely enough to pick the right one to sign out", () => {
    const html = renderToStaticMarkup(<DevicesList sessions={sessions} />);

    // "This device" leads so it survives truncation at 320px.
    expect(html).toContain("This device · Chrome on Mac");
    expect(html).toContain(">Safari on iPhone<");
    // A row without a client label keeps the generic name.
    expect(html).toContain(">Signed-in browser<");
    expect(html).toContain(">Sign out<");
    expect(html).toContain(">Sign out everywhere<");
  });

  it("carries a signed-out row's history at full contrast", () => {
    const html = renderToStaticMarkup(<DevicesList sessions={sessions} />);

    // Not dimmed: the date must stay readable.
    expect(html).not.toContain("opacity-55");
    expect(html).toContain("text-product-muted-foreground");
  });
});
