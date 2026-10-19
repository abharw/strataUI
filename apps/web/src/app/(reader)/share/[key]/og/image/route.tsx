/**
 * `GET /share/:key/og/image`: the unfurl card for a shared page. Only the share key opens it, so
 * the title is never readable from a page id. Space keys 404: a bundle has no single title.
 */
import { ImageResponse } from "next/og";

import { ogPreview } from "@/server/pages/read/assemble";
import { formatDisplayValue } from "@/shared/formatting/display";
import { fitTitle } from "@/app/(reader)/share/[key]/og/fit-title";

interface Context { params: Promise<{ key: string }> }

/**
 * Nothing on the card is per-viewer, so the CDN absorbs repeated unfurls. A renamed page's card
 * catches up within the hour.
 */
const CARD_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { key } = await context.params;
  const preview = await ogPreview(key);
  if (!preview.ok) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" },
    });
  }

  // Unfurlers cache the card, so an absolute date stays true where "2h ago" would not.
  const updated = formatDisplayValue(preview.updatedAt.toISOString().slice(0, 10));
  const title = fitTitle(preview.title);
  // No `fontFamily`: satori bundles no fonts, so only its default can load.
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          color: "#1d1d1f",
          padding: "68px 76px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#6e6e73" }}>Strata</div>
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 1048,
            // fitTitle cuts at word boundaries; clip unbroken runs instead of overlapping the footer.
            maxHeight: 280,
            overflow: "hidden",
            wordBreak: "break-word",
            fontSize: title.length > 42 ? 66 : 78,
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-0.05em",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#6e6e73" }}>A living page</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 58,
              padding: "0 26px",
              borderRadius: 999,
              background: "#f5f5f7",
              fontSize: 26,
              fontWeight: 600,
              color: "#6e6e73",
            }}
          >
            Updated {updated}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": CARD_CACHE,
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
