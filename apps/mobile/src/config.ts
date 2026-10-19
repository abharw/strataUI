import strataOrigin from "./strata-origin.json";

const LOOPBACK_HOSTS = new Set<string>(strataOrigin.loopbackHosts);

/**
 * HTTPS required because capability links are bearer URLs; loopback HTTP only in development.
 * Uses `EXPO_PUBLIC_STRATA_DEV` rather than `__DEV__` so it matches `app.config.ts`.
 */
function isDevelopmentLoopbackOrigin(url: URL, development: boolean): boolean {
  return development && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

export function normalizeConfiguredOrigin(
  raw: string | undefined,
  development = process.env.EXPO_PUBLIC_STRATA_DEV === "1",
): string {
  const value = raw?.trim() || strataOrigin.defaultOrigin;
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && !isDevelopmentLoopbackOrigin(url, development))
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new Error(
      "EXPO_PUBLIC_STRATA_ORIGIN must be an HTTPS origin with no path"
      + " (or a loopback HTTP origin in development)",
    );
  }
  return url.origin;
}

export const STRATA_ORIGIN = normalizeConfiguredOrigin(
  process.env.EXPO_PUBLIC_STRATA_ORIGIN,
);

export const DEVELOPMENT_PRESENTATION_URL = __DEV__
  ? process.env.EXPO_PUBLIC_STRATA_DEV_PRESENTATION_URL?.trim() || null
  : null;
