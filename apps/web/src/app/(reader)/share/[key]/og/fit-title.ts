/**
 * Satori has no `text-overflow`, so long titles are cut at a word boundary with an ellipsis.
 * Titles with no boundary (slugs, URLs, CJK) are cut at the limit; the card also clamps height.
 */

/** Characters the card can draw before the last line runs out of width. */
export const TITLE_LIMIT = 90;

export function fitTitle(title: string): string {
  if (title.length <= TITLE_LIMIT) return title;
  const cut = title.slice(0, TITLE_LIMIT);
  const atWord = cut.replace(/\s+\S*$/u, "");
  return `${atWord === "" ? cut : atWord}…`;
}
