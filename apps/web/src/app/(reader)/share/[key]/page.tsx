/**
 * `/share/:key`: a `pgk_` key opens one page, an `spk_` key a Space's shared bundle. The key is
 * the whole lookup. A session for the page's namespace is redirected to `/pages/:id` (307).
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { PageShell } from "@/features/navigation/page-shell";
import { ViewerFormattingProvider } from "@/shared/formatting/viewer";
import { DocumentSpaceHeading } from "@/features/spaces/space-heading";
import { EmptyState } from "@/shared/ui/empty-state";
import { BundlePageRow, Group } from "@/features/spaces/inventory";
import { currentSessionNamespace } from "@/server/auth/web-session";
import { asksFor } from "@/server/pages/decisions";
import { formatAbsoluteDate } from "@/shared/formatting/display";
import { hasKeyPrefix, pageUrl, shareOgImageUrl } from "@/server/credentials/keys";
import {
  assemblePage,
  assembleSharedPage,
  assetHrefs,
  hydratePageLinks,
  parseViewOrigin,
  recordView,
} from "@/server/pages/read/assemble";
import { loadSpace } from "@/server/spaces/read/lists";
import { readOrigin } from "@/server/api/http/read-origin";
import { ownerRoutes, sharePath } from "@/shared/navigation/owner-routes";
import { pageViewer, type ViewerContext } from "@/shared/navigation/viewer";
import { AttachmentResolverProvider } from "@/page-content/blocks/attachment-list/resolver";
import { StaticApprovalAnswers } from "@/features/page-viewer/decisions";
import { PageFrame, SharedSpaceFrame } from "@/features/page-viewer/page-frame";
import { DirectLivePage, EmbeddedLivePage } from "@/features/page-viewer/page";

import { directPageVariant } from "./page-variant";

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ from?: string; embed?: string }>;
}

/** "Page" is Title Case, matching Home. */
function pageCountLabel(count: number): string {
  return `${count} Page${count === 1 ? "" : "s"}`;
}

export const dynamic = "force-dynamic";

const getPage = cache(assemblePage);
const getSpace = cache(loadSpace);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bare: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
  const { key } = await params;

  if (hasKeyPrefix(key, "space")) {
    const loaded = await getSpace(key);
    return { ...bare, title: loaded.ok ? loaded.value.name : "Pages" };
  }

  // `getPage` is request-memoized, so metadata and render share one page read.
  const assembled = await getPage(key);
  if (!assembled.ok) return bare;
  const title = assembled.value.document.meta.title;
  const base = await readOrigin();
  // Crawlers have no viewer timezone, so social metadata uses deterministic UTC.
  const description = `Updated ${formatAbsoluteDate(assembled.value.updatedAt.toISOString())}`;
  // The card lives under the share address: an unfurler already holds the key, so nothing leaks.
  const image = shareOgImageUrl(base, key);
  return {
    ...bare,
    title,
    description,
    openGraph: {
      type: "website",
      url: pageUrl(base, key),
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, type: "image/png", alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharedLink({ params, searchParams }: Props) {
  const { key } = await params;
  const query = await searchParams;
  if (hasKeyPrefix(key, "space")) return SharedSpace({ key });
  if (hasKeyPrefix(key, "page")) return SharedPage({ key, query });
  // A key without a share prefix answers like one that no longer resolves.
  notFound();
}

async function SharedPage({ key, query }: { key: string; query: { from?: string; embed?: string } }) {
  const assembled = await getPage(key);
  if (!assembled.ok) notFound();
  if ((await headers()).get("sec-fetch-dest") === "document") {
    // A share link may be read by anyone: log the view but never mark it seen. after() keeps
    // the write off TTFB and unable to fail the read.
    const origin = parseViewOrigin(query.from ?? null);
    after(() => recordView(assembled.value.pageId, origin, false));
  }
  const embed = directPageVariant(query.embed) === "embed";
  const doc = assembled.value.document;

  // After the key validates, a session for this page's namespace upgrades to the owner view.
  // Embeds are exempt so owner chrome never appears in someone else's iframe.
  const session = embed ? null : await currentSessionNamespace();
  if (session !== null && session.namespaceId === assembled.value.namespaceId) {
    redirect(ownerRoutes().page(assembled.value.pageId));
  }

  const context: ViewerContext = {
    kind: "direct",
    namespaceId: assembled.value.namespaceId,
    pageKey: key,
  };
  const spec = await hydratePageLinks(doc.spec, context);
  const serverNow = new Date().toISOString();
  const [asks, assets] = await Promise.all([
    asksFor(assembled.value.pageId, doc.spec),
    assetHrefs({ spec, steps: assembled.value.steps }, assembled.value.namespaceId, sharePath(key)),
  ]);
  // The spec ships twice, as HTML and in the Flight payload for the client store. That is the
  // cost of a live page that is readable before its JavaScript arrives.
  const seed = {
    meta: doc.meta,
    spec,
    version: doc.version,
    user: doc.user,
    agentUpdating: doc.agent_updating,
    updatedAt: assembled.value.updatedAt.toISOString(),
    recent: assembled.value.recent,
    steps: assembled.value.steps,
    sequence: assembled.value.sequence,
    asks,
    assets,
    ownerName: assembled.value.ownerName,
    // A share link reads the page, never the owner's roster of agents.
    writer: assembled.value.writer,
    lastSummary: assembled.value.lastSummary,
  };
  const viewer = pageViewer({
    id: assembled.value.pageId,
    spaceId: assembled.value.spaceId,
    spaceName: assembled.value.spaceName,
  }, context);
  return embed
    ? <EmbeddedLivePage viewer={viewer} seed={seed} serverNow={serverNow} />
    : <DirectLivePage viewer={viewer} seed={seed} serverNow={serverNow} />;
}

async function SharedSpace({ key }: { key: string }) {
  const loaded = await getSpace(key);
  if (!loaded.ok) notFound();
  const space = loaded.value;

  const exposed = space.pages;
  if (exposed.length === 1) {
    // A one-page bundle renders in place but resolves links like `/share/:spk/pages/:id`.
    const assembled = await assembleSharedPage(exposed[0].id, space.id, key);
    if (!assembled.ok) notFound();
    const doc = assembled.value.document;
    const spec = await hydratePageLinks(doc.spec, {
      kind: "bundle",
      namespaceId: assembled.value.namespaceId,
      spaceId: space.id,
      bundleKey: key,
    });
    const [asks, assets] = await Promise.all([
      asksFor(assembled.value.pageId, doc.spec),
      // The static frame draws no trail, so it mints no links for one.
      assetHrefs({ spec, steps: null }, assembled.value.namespaceId, sharePath(key)),
    ]);
    return (
      <PageShell>
        <ViewerFormattingProvider serverNow={new Date().toISOString()}>
          <SharedSpaceFrame
            name={space.name}
            emoji={space.emoji}
            detail={pageCountLabel(1)}
          >
            <AttachmentResolverProvider assets={assets}>
              <StaticApprovalAnswers asks={asks} waitingOn={assembled.value.ownerName}>
                <PageFrame
                  sequence={assembled.value.sequence}
                  title={doc.meta.title}
                  spec={spec}
                  updatedAt={assembled.value.updatedAt.toISOString()}
                  titleAs="h2"
                />
              </StaticApprovalAnswers>
            </AttachmentResolverProvider>
          </SharedSpaceFrame>
        </ViewerFormattingProvider>
      </PageShell>
    );
  }

  const total = exposed.length;
  return (
    <PageShell density="list">
      <DocumentSpaceHeading
        name={space.name}
        emoji={space.emoji}
        detail={pageCountLabel(total)}
      />
      <Group>
        {space.pages.length === 0 ? (
          // `Group` is a `<ul>`; `EmptyState` brings no `<li>` of its own.
          <li>
            <EmptyState size="row" title="This link doesn’t include any Pages yet." />
          </li>
        ) : space.pages.map((page) => (
          <BundlePageRow key={page.id} page={page} href={`${sharePath(key)}/pages/${page.id}`} />
        ))}
      </Group>
    </PageShell>
  );
}
