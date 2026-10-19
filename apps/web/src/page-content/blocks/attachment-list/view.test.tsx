import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttachmentList } from "./view";
import { AttachmentResolverProvider } from "./resolver";

const resource = (href: string, mediaType = "image/jpeg", sizeBytes = 1024) => ({
  href,
  filename: href.slice(1),
  media_type: mediaType,
  size_bytes: sizeBytes,
});

describe("attachment-list", () => {
  it("renders a resolved image as a bounded lazy preview and keeps unresolved files honest", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{ plan: resource("/plan.svg", "image/svg+xml") }}>
        <AttachmentList
          items={[
            {
              id: "plan",
              resource_id: "plan",
              label: "Floor plan",
              kind: "image",
              media_type: "image/svg+xml",
            },
            {
              id: "lease",
              resource_id: "missing",
              label: "Lease.pdf",
              kind: "document",
            },
          ]}
        />
      </AttachmentResolverProvider>,
    );

    expect(html).toContain('src="/plan.svg"');
    expect(html).toContain('width="40"');
    expect(html).toContain('height="40"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("Not available yet");
    // An aria-label replaces the contents, so the new-tab cue must be part of it.
    expect(html).toContain('aria-label="Open Floor plan (opens in a new tab)"');
    expect(html).not.toContain('aria-label="Open Lease.pdf"');
    expect(html).toMatch(
      /<a(?=[^>]*data-slot="item")(?=[^>]*href="\/plan\.svg")[^>]*>/,
    );
    expect(html.match(/data-slot="item-separator"/g)?.length).toBe(1);
    expect(html.match(/role="listitem"/g)?.length).toBe(2);
  });

  it("uses the authoritative MIME type when authored image metadata disagrees", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{ receipt: resource("/receipt.pdf", "application/pdf", 2048) }}>
        <AttachmentList
          items={[{
            id: "receipt",
            resource_id: "receipt",
            label: "Receipt",
            kind: "image",
            media_type: "image/png",
            size_bytes: 1,
          }]}
        />
      </AttachmentResolverProvider>,
    );

    expect(html).not.toContain('data-slot="item-header"');
    expect(html).not.toContain('aria-label="View Receipt"');
    expect(html).toContain("application/pdf");
    expect(html).toContain("2.0 KB");
    expect(html).not.toContain("image/png");
  });

  // Layout rules live in globals.css; this checks which tile bucket a count resolves to.
  it("declares a single image and a crowd as different tile collections", () => {
    const alone = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{ one: resource("/one.jpg") }}>
        <AttachmentList items={[{ id: "one", resource_id: "one", label: "One", kind: "image" }]} />
      </AttachmentResolverProvider>,
    );
    expect(alone).toContain('data-collection="tile"');
    expect(alone).toContain('data-count="1"');
    expect(alone.match(/strata-collection-frame/g)?.length).toBe(1);

    const crowd = renderToStaticMarkup(
      <AttachmentResolverProvider
        assets={{ one: resource("/one.jpg"), two: resource("/two.jpg"), three: resource("/three.jpg") }}
      >
        <AttachmentList
          items={[
            { id: "one", resource_id: "one", label: "One", kind: "image" },
            { id: "two", resource_id: "two", label: "Two", kind: "image" },
            { id: "three", resource_id: "three", label: "Three", kind: "image" },
          ]}
        />
      </AttachmentResolverProvider>,
    );
    expect(crowd).toContain('data-collection="tile"');
    expect(crowd).toContain('data-count="many"');
    expect(crowd.match(/strata-collection-frame/g)?.length).toBe(3);
  });

  it("falls back to a neutral document row when kind is absent and the file is unresolved", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{}}>
        <AttachmentList items={[{ id: "brief", resource_id: "missing", label: "Brief" }]} />
      </AttachmentResolverProvider>,
    );

    expect(html).not.toContain("data-collection");
    expect(html).toContain("Brief");
    expect(html).toContain("Not available yet");
    expect(html).not.toContain('aria-label="Open Brief"');
  });

  it("takes the type from the host record when kind is absent and the file resolves", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{ shot: resource("/shot.jpg") }}>
        <AttachmentList items={[{ id: "shot", resource_id: "shot", label: "Shot" }]} />
      </AttachmentResolverProvider>,
    );

    expect(html).toContain('data-collection="tile"');
    expect(html).toContain('src="/shot.jpg"');
  });

  it("does not lay documents out as a gallery at all", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{ lease: resource("/lease.pdf", "application/pdf") }}>
        <AttachmentList
          items={[{ id: "lease", resource_id: "lease", label: "Lease", kind: "document" }]}
        />
      </AttachmentResolverProvider>,
    );

    expect(html).not.toContain("data-collection");
  });

  it("sizes the frame from the measured dimensions so the gallery does not reflow", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider
        assets={{ one: { ...resource("/one.jpg"), width: 1200, height: 900 } }}
      >
        <AttachmentList items={[{ id: "one", resource_id: "one", label: "One", kind: "image" }]} />
      </AttachmentResolverProvider>,
    );
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="900"');
  });

  it("loads the host's small copy into the tile and keeps the original for the tap", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider
        assets={{
          one: {
            ...resource("/one.jpg"),
            width: 4032,
            height: 3024,
            thumb_url: "/one.jpg?w=thumb",
            thumb_width: 640,
            thumb_height: 480,
          },
        }}
      >
        <AttachmentList items={[{ id: "one", resource_id: "one", label: "One", kind: "image" }]} />
      </AttachmentResolverProvider>,
    );

    // A 120px tile should not download a 4032px photo.
    expect(html).toContain('src="/one.jpg?w=thumb"');
    // Dimensions come from the variant being loaded.
    expect(html).toContain('width="640"');
    expect(html).toContain('height="480"');
    expect(html).not.toContain('width="4032"');
    // The tap still opens the file itself.
    expect(html).toMatch(/<a(?=[^>]*data-slot="item")(?=[^>]*href="\/one\.jpg")[^>]*>/);
  });

  it("loads the original when the host holds no small copy", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider assets={{ one: { ...resource("/one.jpg"), width: 800, height: 600 } }}>
        <AttachmentList items={[{ id: "one", resource_id: "one", label: "One", kind: "image" }]} />
      </AttachmentResolverProvider>,
    );

    expect(html).toContain('src="/one.jpg"');
    expect(html).toContain('width="800"');
  });

  it("puts the small copy in a document row's thumbnail too", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider
        assets={{
          shot: { ...resource("/shot.jpg"), thumb_url: "/shot.jpg?w=thumb" },
          lease: resource("/lease.pdf", "application/pdf"),
        }}
      >
        <AttachmentList
          items={[
            { id: "shot", resource_id: "shot", label: "Shot" },
            { id: "lease", resource_id: "lease", label: "Lease" },
          ]}
        />
      </AttachmentResolverProvider>,
    );

    // A mixed set renders rows; the row thumbnail still uses the variant.
    expect(html).not.toContain("data-collection");
    expect(html).toContain('src="/shot.jpg?w=thumb"');
    expect(html).toContain('aria-label="Open Shot (opens in a new tab)"');
  });

  it("renders credit as a quiet caption and the source as a plain link", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider
        assets={{
          one: {
            ...resource("/one.jpg"),
            credit: "Photo by the concierge",
            source_url: "https://www.hotel.example/receipt",
          },
        }}
      >
        <AttachmentList items={[{ id: "one", resource_id: "one", label: "One", kind: "image" }]} />
      </AttachmentResolverProvider>,
    );

    expect(html).toContain("Photo by the concierge");
    expect(html).toContain('href="https://www.hotel.example/receipt"');
    expect(html).toContain("hotel.example");
    expect(html.match(/\(opens in a new tab\)/g)).toHaveLength(1);
    // The source link sits outside the tile link; anchors cannot nest.
    expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>)[\s\S])*<a/);
  });

  it("will not render a source that is not an https link", () => {
    const html = renderToStaticMarkup(
      <AttachmentResolverProvider
        assets={{ one: { ...resource("/one.jpg"), source_url: "javascript:alert(1)" } }}
      >
        <AttachmentList items={[{ id: "one", resource_id: "one", label: "One", kind: "image" }]} />
      </AttachmentResolverProvider>,
    );
    expect(html).not.toContain("javascript:");
  });
});
