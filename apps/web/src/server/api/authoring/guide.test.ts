import { describe, expect, it } from "vitest";

import { generateManifest } from "@/page-content/authoring/manifest";
import { ALLOWED_MEDIA_TYPES, MAX_ASSET_BYTES, MAX_NAMESPACE_BYTES, UPLOAD_WINDOW_SECONDS } from "@/page-content/document/limits";
import { get } from "./guide";

describe("guide vocabulary", () => {
  it("names the catalog in the manifest's order", () => {
    const result = get({ topic: "vocabulary" });
    const listed = [...(result.body.text as string).matchAll(/^- ([a-z-]+): /gm)]
      .map((match) => match[1]);

    expect(result.status).toBe(200);
    expect(listed).toEqual(generateManifest().components.map((component) => component.name));
  });
});

describe("guide default topic", () => {
  it("answers a request with no topic with the one every document names", () => {
    // Every document points agents at `?topic=authoring`, so an omitted topic must return it.
    const result = get({});

    expect(result.status).toBe(200);
    expect(result.body.topic).toBe("authoring");
    expect(result.body.text).toBe(get({ topic: "authoring" }).body.text);
  });
});

describe("guide render-policy", () => {
  it("teaches the file caps from the constants the API enforces", () => {
    // Caps are quoted from one source so agents need not learn them by being refused.
    const text = get({ topic: "render-policy" }).body.text as string;

    expect(text).toContain(`${String(MAX_ASSET_BYTES / (1024 * 1024))} MB per file`);
    expect(text).toContain(`${String(MAX_NAMESPACE_BYTES / (1024 * 1024))} MB per Strata`);
    expect(text).toContain(`${String(UPLOAD_WINDOW_SECONDS / 60)} minutes`);
    expect(text).toContain(ALLOWED_MEDIA_TYPES.join(", "));
    // Attribution, and that the host never fetches it.
    expect(text).toContain("credit");
    expect(text).toContain("source_url is displayed and never fetched");
  });
});
