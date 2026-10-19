import { scopeForPath, type PresentationScope, type ShareScope } from "./presentation-route-contract";

export type { PresentationScope, ShareScope } from "./presentation-route-contract";

export type PresentationUrl = {
  href: string;
  origin: string;
  scope: PresentationScope;
};

/** A parsed link whose authority is one share capability, not a session. */
export type SharePresentationUrl = PresentationUrl & { scope: ShareScope };

export type NavigationDecision =
  | { kind: "allow" }
  | { kind: "external"; href: string; transport: "browser" | "system" }
  | { kind: "block" };

function presentationQueryKeys(url: URL): string[] {
  const keys: string[] = [];
  url.searchParams.forEach((_value, key) => keys.push(key));
  return keys;
}

function normalizePresentationQuery(url: URL): boolean {
  const fromValues = url.searchParams.getAll("from");
  const from = fromValues.length === 1 ? fromValues[0] : null;
  url.searchParams.delete("embed");
  url.searchParams.delete("from");
  if (from === "message" || from === "dashboard") url.searchParams.set("from", from);
  return presentationQueryKeys(url).every((key) => key === "from");
}

function hasCanonicalPresentationQuery(url: URL): boolean {
  const keys = presentationQueryKeys(url);
  if (keys.some((key) => key !== "from")) return false;
  const fromValues = url.searchParams.getAll("from");
  if (fromValues.length > 1) return false;
  const from = fromValues[0] ?? null;
  return from === null || from === "message" || from === "dashboard";
}

export function parsePresentationUrl(candidate: string, configuredOrigin: string): PresentationUrl {
  const url = new URL(candidate);
  if (url.origin !== configuredOrigin || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error("That link is not from the configured Strata origin");
  }
  if (url.username !== "" || url.password !== "" || !normalizePresentationQuery(url)) {
    throw new Error("That link is not a canonical Strata presentation URL");
  }
  const scope = scopeForPath(url.pathname);
  if (scope === null) throw new Error("That link is not a supported Strata presentation");
  return { href: url.toString(), origin: url.origin, scope };
}

/**
 * Whether a navigation stays inside the share capability the isolated view opened with: the
 * bundle index and its member pages only. Session paths are judged by `decideHomeNavigation`.
 */
export function decideNavigation(
  root: SharePresentationUrl,
  candidate: string,
): NavigationDecision {
  if (candidate === "about:blank") return { kind: "allow" };

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { kind: "block" };
  }

  if (url.protocol === "mailto:" || url.protocol === "tel:") {
    return { kind: "external", href: url.toString(), transport: "system" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "block" };

  if (url.origin === root.origin && hasCanonicalPresentationQuery(url)) {
    const nextScope = scopeForPath(url.pathname);
    if (nextScope?.kind === "share" && nextScope.key === root.scope.key) return { kind: "allow" };
  }

  return { kind: "external", href: url.toString(), transport: "browser" };
}
