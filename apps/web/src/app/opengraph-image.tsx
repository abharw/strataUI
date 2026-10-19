/**
 * Default unfurl card; shared pages override it with their own. Satori ships no fonts, so no
 * `fontFamily` is set.
 */
import { ImageResponse } from "next/og";

export const alt = "Strata — living pages, not another wall of text.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#ffffff",
          color: "#1d1d1f",
          padding: "68px 76px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 132,
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-0.05em",
          }}
        >
          Strata
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 40, color: "#6e6e73" }}>
          Living pages, not another wall of text.
        </div>
      </div>
    ),
    size,
  );
}
