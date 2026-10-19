/**
 * Cookie name, separate so the proxy can check for a session without importing database code.
 * `__Host-` makes the browser require Secure, path `/` and this host, so no subdomain can plant it.
 */
export const WEB_SESSION_COOKIE = "__Host-strata_session";
