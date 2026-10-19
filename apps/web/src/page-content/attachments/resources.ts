/** Host-verified attachment metadata exposed to the page renderer. */
export interface AttachmentResource {
  href: string;
  filename: string;
  media_type: string;
  size_bytes: number;
  /** Measured pixel dimensions, used to reserve layout space before the image loads. */
  width?: number | null;
  height?: number | null;
  /**
   * 640px-max thumbnail for tiles. Absent for PDFs, SVGs and small images; tiles then fall back
   * to `href`.
   */
  thumb_url?: string;
  thumb_width?: number | null;
  thumb_height?: number | null;
  /** Rendered as a caption. */
  credit?: string | null;
  /** Rendered as a plain link and never fetched. */
  source_url?: string | null;
}

export type AttachmentResources = Record<string, AttachmentResource>;
