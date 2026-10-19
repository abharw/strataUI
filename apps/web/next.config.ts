import type { NextConfig } from "next";

/**
 * Headers on every response. `nosniff` guards against content-type confusion (`text/plain` and
 * `text/csv` are accepted asset types); `Permissions-Policy` denies device access to
 * agent-authored pages. Framing policy is owner-only and lives in `src/proxy.ts`.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // The local preview is served on loopback; without this Next treats `127.0.0.1` as
  // cross-origin from `localhost` and blocks client chunks, so nothing hydrates.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // ~1,300 icon modules; without this every one is pulled into the graph.
    optimizePackageImports: ["@phosphor-icons/react"],

    // No `serverActions.allowedOrigins`: on Vercel Origin and Host already match, and adding
    // origins would widen the CSRF boundary every owner mutation relies on.
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
