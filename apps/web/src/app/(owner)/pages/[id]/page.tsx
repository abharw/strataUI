/**
 * `/pages/:id`, the canonical address of one page. Without a session it redirects (307) to
 * sign-in with a return path.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OwnedPageView } from "./owned-page-view";
import { currentSessionNamespace } from "@/server/auth/web-session";
import { ownedPageTitle } from "@/server/pages/read/assemble";
import { ownerRoutes } from "@/shared/navigation/owner-routes";

interface Props { params: Promise<{ id: string }> }

export const dynamic = "force-dynamic";

// No OpenGraph: the URL is useless without the owner's session.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bare: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };
  const session = await currentSessionNamespace();
  if (session === null) return bare;
  const { id } = await params;
  const title = await ownedPageTitle(id, session.namespaceId);
  return title === null ? bare : { ...bare, title };
}

export default async function CanonicalPage({ params }: Props) {
  const [{ id }, session] = await Promise.all([params, currentSessionNamespace()]);
  if (session === null) redirect(`/home/sign-in?next=${encodeURIComponent(ownerRoutes().page(id))}`);
  return (
    <OwnedPageView
      pageId={id}
      context={{ kind: "owner-session", namespaceId: session.namespaceId }}
    />
  );
}
