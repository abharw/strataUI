/**
 * Resolves what page chrome may draw from the viewer's authority (share link, owner session, or
 * Space share key), never from the route. Chrome never grants more than the viewer holds.
 */

import { ownerRoutes, sharePath } from "./owner-routes";

export type ViewerContext =
  | { kind: "direct"; namespaceId: string; pageKey: string }
  | { kind: "owner-session"; namespaceId: string }
  | { kind: "bundle"; namespaceId: string; spaceId: string; bundleKey: string };

export type PageLinkTarget = {
  id: string;
  spaceId: string;
  shared: boolean;
};

export type PageIdentity = { id: string; spaceId: string; spaceName: string };

/** An owner session. Mutations are Server Actions bound to `pageId`; `changesUrl` is a GET poll. */
export interface OwnerPageViewer {
  kind: "owner";
  /** Ownership is proved inside each action. */
  pageId: string;
  space: { name: string; url: string };
  changesUrl: string;
}

/** A page share key: read-only, one page, no Space link and no mutations. */
export interface DirectPageViewer {
  kind: "direct";
  changesUrl: string;
  manageNote: string;
}

/** A bundle key reads a page as a member of one visible shared Space. */
export interface BundlePageViewer {
  kind: "bundle";
  space: { name: string; url: string };
}

/** A discriminated union rather than permission booleans, so impossible combinations do not type-check. */
export type PageViewer = OwnerPageViewer | DirectPageViewer | BundlePageViewer;

type OwnerContext = Extract<ViewerContext, { kind: "owner-session" }>;
type DirectContext = Extract<ViewerContext, { kind: "direct" }>;
type BundleContext = Extract<ViewerContext, { kind: "bundle" }>;

export function pageViewer(page: PageIdentity, context: OwnerContext): OwnerPageViewer;
export function pageViewer(page: PageIdentity, context: DirectContext): DirectPageViewer;
export function pageViewer(page: PageIdentity, context: BundleContext): BundlePageViewer;

export function pageViewer(
  page: PageIdentity,
  context: ViewerContext,
): PageViewer {
  if (context.kind === "owner-session") {
    const routes = ownerRoutes();
    const spaceUrl = routes.spaceView(page.spaceId);
    return {
      kind: "owner",
      pageId: page.id,
      space: { name: page.spaceName, url: spaceUrl },
      changesUrl: routes.pageChanges(page.id),
    };
  }

  if (context.kind === "direct") {
    return {
      kind: "direct",
      // The share key resolves the page, so the page id stays out of the address.
      changesUrl: `${sharePath(context.pageKey)}/changes`,
      manageNote: "To pin or delete this page, open it from Home.",
    };
  }

  return {
    kind: "bundle",
    space: { name: page.spaceName, url: sharePath(context.bundleKey) },
  };
}

/** Resolves an internal link within the current authority, never stronger than the viewer's. */
export function pageLinkUrl(target: PageLinkTarget, context: ViewerContext): string | null {
  if (context.kind === "owner-session") return ownerRoutes().page(target.id);
  // A page share key covers one page, so cross-references stay dead.
  if (context.kind === "direct") return null;
  if (target.spaceId !== context.spaceId || !target.shared) return null;
  return `${sharePath(context.bundleKey)}/pages/${target.id}`;
}
