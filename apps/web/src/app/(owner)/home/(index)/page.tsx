/**
 * Home for a signed-in browser. The session is the only authority, so no secret is rendered or
 * linked. Without a session it redirects (307) to `/home/sign-in`.
 */
import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { HomeTree, type HomeTreeTab } from "@/features/home/home-tree";
import { PageShell } from "@/features/navigation/page-shell";
import { listOwnerSessions } from "@/server/auth/owner-session";
import { currentSessionNamespace, readHomeData } from "@/server/auth/web-session";
import { loadAgentsForNamespace } from "@/server/credentials/agents";
import { readNamespaceIdentity } from "@/server/auth/identity";
import { loadHomeForNamespace } from "@/server/spaces/read/lists";
import { ownerRoutes } from "@/shared/navigation/owner-routes";
import { initialOwnerSearch } from "@/shared/navigation/search";

interface Props {
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

export default async function SessionHomePage({ searchParams = Promise.resolve({}) }: Props) {
  const session = await currentSessionNamespace();
  if (session === null) redirect("/home/sign-in");

  const [query, home, agents, sessions, identity] = await Promise.all([
    searchParams,
    readHomeData(() => loadHomeForNamespace(session.namespaceId)),
    readHomeData(() => loadAgentsForNamespace(session.namespaceId)),
    readHomeData(() => listOwnerSessions(session.namespaceId, session.sessionId)),
    // Usually null; only the provisioning agent sets a name.
    readHomeData(() => readNamespaceIdentity(session.namespaceId)),
  ]);
  const tab: HomeTreeTab = query.tab === "recent" ? "recent" : "spaces";
  const initialQuery = initialOwnerSearch(query.q);
  // Read on the server so the first paint is already in selection mode.
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
        personName={identity?.personName ?? null}
        selecting={selecting}
      />
    </PageShell>
  );
}
