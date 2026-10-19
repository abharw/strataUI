/**
 * The owned-page document behind `/pages/:id`, its only caller. Authority is always the
 * session, so it takes no share key.
 */
import { headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";

import { asksFor } from "@/server/pages/decisions";
import {
  assembleOwnedPage,
  assetHrefs,
  hydratePageLinks,
  recordView,
  viewBaseFor,
} from "@/server/pages/read/assemble";
import { ownerRoutes } from "@/shared/navigation/owner-routes";
import { pageViewer, type ViewerContext } from "@/shared/navigation/viewer";
import { OwnerLivePage } from "@/features/page-viewer/page";

export type OwnedPageContext = Extract<ViewerContext, { kind: "owner" | "owner-session" }>;

export async function OwnedPageView({
  pageId,
  context,
}: {
  pageId: string;
  context: OwnedPageContext;
}) {
  const assembled = await assembleOwnedPage(pageId, context.namespaceId);
  if (!assembled.ok) notFound();
  if ((await headers()).get("sec-fetch-dest") === "document") {
    after(() => recordView(pageId, "home", true));
  }
  const doc = assembled.value.document;
  const spec = await hydratePageLinks(doc.spec, context);
  const [asks, assets] = await Promise.all([
    asksFor(assembled.value.pageId, doc.spec),
    assetHrefs({ spec, steps: assembled.value.steps }, assembled.value.namespaceId, viewBaseFor(context, pageId)),
  ]);

  const routes = ownerRoutes();
  const seed = {
    meta: doc.meta,
    // Polling keeps this current if the Page moves to another Space.
    space: {
      name: assembled.value.spaceName,
      url: routes.spaceView(assembled.value.spaceId),
    },
    spec,
    version: doc.version,
    user: doc.user,
    shared: assembled.value.shared,
    agentUpdating: doc.agent_updating,
    updatedAt: assembled.value.updatedAt.toISOString(),
    recent: assembled.value.recent,
    steps: assembled.value.steps,
    sequence: assembled.value.sequence,
    asks,
    assets,
    ownerName: assembled.value.ownerName,
    // Null for a read-only session assembled as a reader.
    writer: assembled.value.writer,
    lastSummary: assembled.value.lastSummary,
  };
  const serverNow = new Date().toISOString();

  return (
    <OwnerLivePage
      viewer={pageViewer(
        { id: pageId, spaceId: assembled.value.spaceId, spaceName: assembled.value.spaceName },
        context,
      )}
      serverNow={serverNow}
      seed={seed}
    />
  );
}
