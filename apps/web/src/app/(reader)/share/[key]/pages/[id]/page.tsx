/**
 * `/share/:spk/pages/:id`: a member page of a shared Space. The Space key is the capability; the
 * id only selects a member, and `assembleSharedPage` refuses pages not exposed in this bundle.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { asksFor } from "@/server/pages/decisions";
import { assembleSharedPage, assetHrefs, hydratePageLinks } from "@/server/pages/read/assemble";
import { loadSpace } from "@/server/spaces/read/lists";
import { sharePath } from "@/shared/navigation/owner-routes";
import { pageViewer } from "@/shared/navigation/viewer";
import { AttachmentResolverProvider } from "@/page-content/blocks/attachment-list/resolver";
import { StaticApprovalAnswers } from "@/features/page-viewer/decisions";
import { BundlePageFrame } from "@/features/page-viewer/page-frame";
import { PageShell } from "@/features/navigation/page-shell";
import { ViewerFormattingProvider } from "@/shared/formatting/viewer";

interface Props { params: Promise<{ key: string; id: string }> }
export const dynamic = "force-dynamic";

const getSpace = cache(loadSpace);
const getPage = cache(assembleSharedPage);

const bare: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Titles the tab by the page; lookups are shared with the render via `cache`. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key, id } = await params;
  const bundle = await getSpace(key);
  if (!bundle.ok) return bare;
  const assembled = await getPage(id, bundle.value.id, key);
  return assembled.ok ? { ...bare, title: assembled.value.document.meta.title } : bare;
}

export default async function SharedSpacePage({ params }: Props) {
  const { key, id } = await params;
  const bundle = await getSpace(key);
  if (!bundle.ok) notFound();
  // The bundle key resolves this page's links and `sequence` within the same Space.
  const assembled = await getPage(id, bundle.value.id, key);
  if (!assembled.ok) notFound();
  const doc = assembled.value.document;
  const context = {
    kind: "bundle",
    namespaceId: assembled.value.namespaceId,
    spaceId: bundle.value.id,
    bundleKey: key,
  } as const;
  const spec = await hydratePageLinks(doc.spec, context);
  const viewer = pageViewer(
    { id, spaceId: assembled.value.spaceId, spaceName: bundle.value.name },
    context,
  );
  const [asks, assets] = await Promise.all([
    asksFor(assembled.value.pageId, doc.spec),
    // The static frame draws no trail, so it mints no links for one.
    assetHrefs({ spec, steps: null }, assembled.value.namespaceId, `${sharePath(key)}/pages/${id}`),
  ]);
  return (
    <PageShell>
      <ViewerFormattingProvider serverNow={new Date().toISOString()}>
        <AttachmentResolverProvider assets={assets}>
          <StaticApprovalAnswers asks={asks} waitingOn={assembled.value.ownerName}>
            <BundlePageFrame
              sequence={assembled.value.sequence}
              viewer={viewer}
              title={doc.meta.title}
              spec={spec}
              updatedAt={assembled.value.updatedAt.toISOString()}
            />
          </StaticApprovalAnswers>
        </AttachmentResolverProvider>
      </ViewerFormattingProvider>
    </PageShell>
  );
}
