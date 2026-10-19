import { HomeTree } from "@/features/home/home-tree";
import { PageShell } from "@/features/navigation/page-shell";
import type { OwnerSessionSummary } from "@/server/auth/owner-session";
import type { AgentRoster } from "@/server/credentials/agents";
import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";

const updatedAt = new Date("2026-08-28T13:06:00.000Z");

// Two provider glyphs, a monogram fallback, and one revoked agent for the dimmed state.
const agents: AgentRoster[] = [
  {
    grantId: "1c7f0f5b-0f4a-4a2f-9f4e-1c3d5a7b9001",
    label: "Instinct",
    driver: "instinct",
    connectedAt: "2026-07-02T09:14:00.000Z",
    lastUsedAt: "2026-08-28T13:06:00.000Z",
    revokedAt: null,
    mode: "rotating",
  },
  {
    grantId: "2d8a1e6c-1a5b-4b30-8e5f-2d4e6b8c9002",
    label: "ChatGPT (work)",
    driver: "chatgpt",
    connectedAt: "2026-07-19T16:40:00.000Z",
    lastUsedAt: "2026-08-27T20:11:00.000Z",
    revokedAt: null,
    mode: "static",
  },
  {
    grantId: "3e9b2f7d-2b6c-4c41-9f60-3e5f7c9d9003",
    label: "Claude Code",
    driver: "claude-code",
    connectedAt: "2026-08-05T11:02:00.000Z",
    lastUsedAt: "2026-08-26T08:30:00.000Z",
    revokedAt: null,
    mode: "rotating",
  },
  {
    grantId: "4f0c3a8e-3c7d-4d52-8071-4f608daea004",
    label: "Kitchen iPad",
    driver: "strata-mobile",
    connectedAt: "2026-06-11T07:25:00.000Z",
    lastUsedAt: "2026-08-14T18:03:00.000Z",
    revokedAt: "2026-08-21T09:00:00.000Z",
    mode: "rotating",
  },
];

const spaces: InventorySpace[] = [
  {
    id: "space-studio-launch",
    slug: "studio-launch",
    name: "Studio launch",
    emoji: "🚀",
    activePageCount: 2,
    sharedPageCount: 0,
    privatePageCount: 2,
    updatedAt,
    shareUrl: null,
    sharedAt: null,
  },
  {
    id: "space-lisbon-trip",
    slug: "lisbon-trip",
    name: "Lisbon trip",
    emoji: "✈️",
    activePageCount: 1,
    sharedPageCount: 1,
    privatePageCount: 0,
    updatedAt,
    shareUrl: "https://strata.test/share/spk_lisbon-preview",
    sharedAt: new Date("2026-08-25T15:30:00.000Z"),
  },
];

const pages: ListPage[] = [
  {
    id: "page-venue-choice",
    title: "Venue choice",
    answer: "Two viable venue holds remain; the waterfront option expires Friday.",
    updatedAt,
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: false,
    exposureActor: "system",
    spaceId: spaces[0].id,
    spaceSlug: spaces[0].slug,
    spaceName: spaces[0].name,
    writer: agents[0],
    lastSummary: "Added two venue holds and marked the waterfront option expiring Friday.",
  },
  {
    id: "page-launch-readiness",
    title: "Launch readiness",
    answer: "Launch is on track; billing review is the only open dependency.",
    updatedAt,
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: false,
    exposureActor: "system",
    spaceId: spaces[0].id,
    spaceSlug: spaces[0].slug,
    spaceName: spaces[0].name,
    writer: agents[1],
    lastSummary: "Cleared the billing review blocker and re-checked the launch dependencies.",
  },
  {
    id: "page-arrival-plan",
    title: "Arrival plan",
    answer: "Arrival is coordinated from landing through apartment check-in.",
    updatedAt,
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: true,
    exposureActor: "system",
    spaceId: spaces[1].id,
    spaceSlug: spaces[1].slug,
    spaceName: spaces[1].name,
    writer: agents[2],
    lastSummary: "Filled in the airport transfer and the apartment check-in window.",
  },
];

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
    id: "session-travel",
    current: false,
    client_label: "Safari on iPhone",
    created_at: "2026-08-19T18:12:00.000Z",
    last_used_at: "2026-08-27T20:11:00.000Z",
    revoked_at: null,
  },
];

/** Database-free visual contract for the private Home surface. */
export function HomePreview() {
  return (
    <PageShell density="list">
      <HomeTree
        spaces={spaces}
        pages={pages}
        agents={agents}
        sessions={sessions}
        initialSpaceId={spaces[1].id}
      />
    </PageShell>
  );
}
