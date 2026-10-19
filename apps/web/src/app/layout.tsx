import type { Metadata, Viewport } from "next";

import "./globals.css";

// Root metadata is static, so the origin comes from the environment rather than request headers.
const SITE_ORIGIN = process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3000";

/**
 * The native WebView gives the skip link `:focus-visible` on load, so the mobile shell
 * (`StrataMobile/` User-Agent) marks the root to hide it until the first key or pointer.
 * Inline in `<head>` so it runs before load-time focus; the owner CSP sets no `script-src`.
 */
export const SHELL_MARK_SCRIPT =
  'if(navigator.userAgent.indexOf("StrataMobile/")!==-1){var d=document.documentElement;d.setAttribute("data-strata-shell","native");var u=function(){d.removeAttribute("data-strata-shell");removeEventListener("keydown",u,true);removeEventListener("pointerdown",u,true)};addEventListener("keydown",u,true);addEventListener("pointerdown",u,true)}';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: "Strata", template: "%s · Strata" },
  openGraph: {
    type: "website",
    siteName: "Strata",
    title: "Strata",
    description: "Living pages, not another wall of text.",
    url: "/",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#FFFFFF",
};

// Tooltip and toast providers are mounted by the surfaces that use them, keeping them out of
// the landing and sign-in bundles.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="service-doc" href="/llms.txt" type="text/markdown" />
        <link rel="service-desc" href="/openapi.json" type="application/vnd.oai.openapi+json" />
        <link rel="service-meta" href="/.well-known/strata.json" type="application/json" />
        <script dangerouslySetInnerHTML={{ __html: SHELL_MARK_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
