// `/spaces/:id` renders the Home tree with that Space expanded.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { HomeTree, type HomeTreeTab } from "@/features/home/home-tree";
import { PageShell } from "@/features/navigation/page-shell";
import { listOwnerSessions } from "@/server/auth/owner-session";
import { currentSessionNamespace, readHomeData } from "@/server/auth/web-session";
import { loadAgentsForNamespace } from "@/server/credentials/agents";
import { readNamespaceIdentity } from "@/server/auth/identity";
import { loadHomeForNamespace, ownsSpace } from "@/server/spaces/read/lists";
import { ownerRoutes } from "@/shared/navigation/owner-routes";
import { initialOwnerSearch } from "@/shared/navigation/search";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    tab?: string | string[];
    q?: string | string[];
    select?: string | string[];
  }>;
}

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Home",
    robots: { index: false, follow: false },
    referrer: "same-origin",
  };
}

export default async function SpacePage({ params, searchParams = Promise.resolve({}) }: Props) {
  const [{ id }, session] = await Promise.all([params, currentSessionNamespace()]);
  if (session === null) redirect(`/home/sign-in?next=${encodeURIComponent(ownerRoutes().spaceView(id))}`);

  // A missing or foreign Space must 404 rather than render as plain Home.
  if (!await readHomeData(() => ownsSpace(id, session.namespaceId))) notFound();

  // Same reads as `/home`; the agent roster is the legend for attribution marks.
  const [query, home, agents, sessions, identity] = await Promise.all([
    searchParams,
    readHomeData(() => loadHomeForNamespace(session.namespaceId)),
    readHomeData(() => loadAgentsForNamespace(session.namespaceId)),
    readHomeData(() => listOwnerSessions(session.namespaceId, session.sessionId)),
    readHomeData(() => readNamespaceIdentity(session.namespaceId)),
  ]);
  // The Space may be deleted between the ownership check and this read.
  if (!home.spaces.some((space) => space.id === id)) notFound();
  const tab: HomeTreeTab = query.tab === "recent" ? "recent" : "spaces";
  const initialQuery = initialOwnerSearch(query.q);
  // Read on the server so the first paint is in the right mode; a repeated param is an array
  // and does not arm it.
  const selecting = query.select === "1";

  return (
    <PageShell density="list">
      <HomeTree
        spaces={home.spaces}
        pages={home.recentPages}
        agents={agents}
        sessions={sessions}
        initialTab={tab}
        initialQuery={initialQuery}
        bodySearch={{ url: ownerRoutes().search }}
        initialSpaceId={id}
        personName={identity?.personName ?? null}
        selecting={selecting}
      />
    </PageShell>
  );
}
