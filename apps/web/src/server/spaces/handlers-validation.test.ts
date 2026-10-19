import { describe, expect, it } from "vitest";

import { CreateSpaceBodySchema, UpdateSpaceBodySchema } from "./handlers";

describe("Space product validation", () => {
  it("keeps Space names short enough to work as navigation labels", () => {
    expect(CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "S".repeat(30), emoji: "🗺️" }).success).toBe(true);
    expect(CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "S".repeat(31), emoji: "🗺️" }).success).toBe(false);
    expect(UpdateSpaceBodySchema.safeParse({ name: "S".repeat(31) }).success).toBe(false);
  });

  it.each(["🧑🏽‍💻", "🇺🇸", "✈️", "👨‍👩‍👧‍👦"])("accepts one complete emoji grapheme: %s", (emoji) => {
    expect(CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "Roadmap", emoji }).success).toBe(true);
  });

  it("takes the bare character an agent types and stores the emoji spelling", () => {
    const created = CreateSpaceBodySchema.safeParse({ slug: "love", name: "Love", emoji: "❤" });
    expect(created.success).toBe(true);
    expect(created.data?.emoji).toBe("❤\uFE0F");
    expect(UpdateSpaceBodySchema.parse({ emoji: "☀" }).emoji).toBe("☀\uFE0F");
  });

  it.each(["Roadmap", " ", "😀😀", "😀 text", "a😀"])("rejects a non-single-emoji marker: %s", (emoji) => {
    expect(CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "Roadmap", emoji }).success).toBe(false);
  });

  it("requires an emoji on create but permits an explicit emoji-only patch", () => {
    expect(CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "Roadmap" }).success).toBe(false);
    expect(UpdateSpaceBodySchema.safeParse({ emoji: "🗺️" }).success).toBe(true);
  });

  it("refuses a field the body does not take", () => {
    expect(UpdateSpaceBodySchema.safeParse({ extra: true }).success).toBe(false);
    expect(CreateSpaceBodySchema.safeParse({ slug: "r", name: "Roadmap", emoji: "🗺️", extra: true }).success).toBe(false);
  });

  it("refuses a whitespace-only name the way it refuses an empty one", () => {
    const blank = CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "   ", emoji: "🗺️" });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.message).toContain("2-4 words");
    // The accepted name arrives trimmed.
    const kept = CreateSpaceBodySchema.safeParse({ slug: "roadmap", name: "  Roadmap  ", emoji: "🗺️" });
    expect(kept.success && kept.data.name).toBe("Roadmap");
    expect(UpdateSpaceBodySchema.safeParse({ name: " " }).success).toBe(false);
  });
});
