/**
 * Owner URLs. No secret appears in any address; the session cookie is the only owner authority.
 * Owner mutations are Server Actions, so only canonical documents and GET reads live here.
 */

/** GET reads behind the owner session. Share links never reach them. */
type CredentialOwnerRoutes = Readonly<{
  /** `GET` the connected agents. */
  agents: string;
  /** `GET` Page-body matches for Home's current query. */
  search: string;
}>;

export type OwnerRoutes = Readonly<{
  home: "/home";
  /** Where the owner reads a Space. */
  spaceView: (spaceId: string) => string;
  /** The canonical page document. */
  page: (pageId: string) => string;
  pageAttachment: (pageId: string, resourceId: string) => string;
  pageChanges: (pageId: string) => string;
}> & CredentialOwnerRoutes;

function pageDoc(pageId: string): string {
  return `/pages/${encodeURIComponent(pageId)}`;
}

const OWNER_ROUTES: OwnerRoutes = {
  home: "/home",
  spaceView: (spaceId) => `/spaces/${encodeURIComponent(spaceId)}`,
  page: pageDoc,
  pageAttachment: (pageId, resourceId) => `${pageDoc(pageId)}/assets/${encodeURIComponent(resourceId)}`,
  pageChanges: (pageId) => `${pageDoc(pageId)}/changes`,
  agents: "/home/agents",
  search: "/home/search",
};

export function ownerRoutes(): OwnerRoutes {
  return OWNER_ROUTES;
}

/**
 * A complete owner URL when the caller has an origin, otherwise the canonical
 * relative route for server work that runs outside a request scope.
 */
export function ownerPageUrl(baseUrl: string, pageId: string): string {
  const path = pageDoc(pageId);
  return baseUrl === "" ? path : new URL(path, baseUrl).toString();
}

/** The read-only address of a page or Space share key. */
export function sharePath(shareKey: string): string {
  return `/share/${shareKey}`;
}
