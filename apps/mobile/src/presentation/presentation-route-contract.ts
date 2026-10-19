const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const PAGE_KEY = "pgk_[A-Za-z0-9_-]{43}";
const SPACE_KEY = "spk_[A-Za-z0-9_-]{43}";
const SHARE_KEY = `(?:${PAGE_KEY}|${SPACE_KEY})`;

/* ---------------------------------------------------------- the live map */

/** `/share/:key` and `/share/:spk/pages/:id` — a link somebody was handed. */
const SHARE = new RegExp(`^/share/(${SHARE_KEY})(?:/pages/(${UUID}))?$`);
/** Everything the owner's session opens, plus sign-in. */
const SESSION = new RegExp(
  `^(?:/home|/home/sign-in|/pages/${UUID}|/spaces/${UUID})$`,
);

/**
 * Which cookie store a link opens in. Session paths use the persistent store because sign-in
 * sets the cookie there; `/share/…` links carry their own bearer and stay isolated.
 */
export type PresentationScope =
  /** One share link and at most one page inside it. */
  | ShareScope
  /** An address the owner session answers. */
  | { kind: "session"; path: string };

export type ShareScope = { kind: "share"; key: string; pageId: string | null };

export function scopeForPath(pathname: string): PresentationScope | null {
  const share = SHARE.exec(pathname);
  if (share) return { kind: "share", key: share[1], pageId: share[2] ?? null };

  if (SESSION.test(pathname)) {
    return { kind: "session", path: pathname };
  }

  return null;
}
