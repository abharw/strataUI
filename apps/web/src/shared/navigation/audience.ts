/** The owner may see curation state that a forwarded capability cannot. */
export type DocumentAudience = "owner" | "reader";

/** Pinning is private owner curation, never part of a Page's shared content. */
export function pinnedForAudience(pinned: boolean, audience: DocumentAudience): boolean {
  return audience === "owner" && pinned;
}
