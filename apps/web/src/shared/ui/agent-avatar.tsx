/**
 * Agent attribution mark. The tint is hashed from `driver:label` rather than the grant id, so a
 * reconnected agent keeps its colour. Only the hue varies; lightness and chroma are fixed.
 */
import type { CSSProperties } from "react";

import type { PageWriter } from "@/server/pages/read/provenance";
import { cn } from "./cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/primitives/avatar";

import { driverGlyph } from "./driver-glyph";

export type AgentAvatarSize = "xs" | "sm" | "md";

/**
 * 14px in tree rows, 16px in the page header, 24px on the agents list. `glyph` is the fraction of
 * the disc a provider mark fills. `text` goes on the fallback, which sets its own font size.
 */
const SIZES: Record<AgentAvatarSize, { root: string; text: string; disc: number; glyph: number }> = {
  xs: { root: "size-[14px]", text: "text-mark-xs", disc: 14, glyph: 0.62 },
  sm: { root: "size-4", text: "text-mark-sm", disc: 16, glyph: 0.62 },
  md: { root: "size-6", text: "text-mark-md", disc: 24, glyph: 0.58 },
};

/**
 * Twelve hues 30° apart, so distinct tints are clearly distinct instead of near-collisions.
 * FNV-1a gives the same answer on server and client, which the inline RSC style requires.
 */
const HUE_STEPS = 12;

export function agentHue(driver: string, label: string): number {
  const key = `${driver}:${label}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % HUE_STEPS) * (360 / HUE_STEPS);
}

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;

/** The first grapheme, uppercased. An emoji label keeps its emoji. */
export function agentMonogram(label: string): string {
  const trimmed = label.trim();
  if (trimmed === "") return "";
  const first = segmenter === null
    ? [...trimmed][0] ?? ""
    : [...segmenter.segment(trimmed)][0]?.segment ?? "";
  return first.toLocaleUpperCase();
}

export function AgentAvatar({
  writer,
  size = "sm",
  imageSrc,
  className,
}: {
  /** Null when the writing grant is gone or was never recorded. */
  writer: PageWriter | null;
  size?: AgentAvatarSize;
  /** Optional provider image; currently unused. */
  imageSrc?: string;
  className?: string;
}) {
  // Unknown writer: a hollow dashed disc.
  if (writer === null) {
    return (
      <span
        aria-hidden
        data-strata-agent-avatar="unknown"
        className={cn(
          "inline-block shrink-0 rounded-full border border-dashed border-border",
          SIZES[size].root,
          className,
        )}
      />
    );
  }

  const metrics = SIZES[size];
  const glyph = driverGlyph(writer.driver);

  return (
    <Avatar
      aria-hidden
      data-strata-agent-avatar={writer.revokedAt === null ? "live" : "revoked"}
      // `after:hidden` drops the primitive's ring, which dominates at 14px. Revoked renders at 55%.
      className={cn(
        "after:hidden",
        metrics.root,
        writer.revokedAt === null ? null : "opacity-55",
        className,
      )}
      style={{ "--agent-hue": String(agentHue(writer.driver, writer.label)) } as CSSProperties}
    >
      {imageSrc === undefined ? null : <AvatarImage src={imageSrc} alt="" />}
      <AvatarFallback
        data-strata-agent-tint=""
        data-strata-agent-mark={glyph === null ? "monogram" : "glyph"}
        // The half-pixel translate below corrects flex centring to cap height.
        className={cn("font-medium leading-none tabular-nums", glyph === null ? metrics.text : null)}
        // Glyphs are sized in px as a fraction of the disc, not snapped to a type step.
        style={glyph === null
          ? undefined
          : { fontSize: `${Math.round(metrics.disc * metrics.glyph * glyph.scale * 100) / 100}px` }}
      >
        {glyph === null
          ? <span className="translate-y-[0.5px]">{agentMonogram(writer.label)}</span>
          : glyph.render()}
      </AvatarFallback>
    </Avatar>
  );
}
