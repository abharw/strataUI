/** Small lexical normalizer: month names, simple English inflection and absence wording. */
export function normalizeText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

const TOKEN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with",
]);

const MONTH_TOKENS: Readonly<Record<string, string>> = {
  jan: "january",
  january: "january",
  feb: "february",
  february: "february",
  mar: "march",
  march: "march",
  apr: "april",
  april: "april",
  may: "may",
  jun: "june",
  june: "june",
  jul: "july",
  july: "july",
  aug: "august",
  august: "august",
  sep: "september",
  sept: "september",
  september: "september",
  oct: "october",
  october: "october",
  nov: "november",
  november: "november",
  dec: "december",
  december: "december",
};

const ABSENCE_TOKENS = new Set([
  "absent",
  "lack",
  "lacked",
  "lacking",
  "lacks",
  "missing",
  "no",
  "not",
  "without",
]);

function canonicalToken(raw: string): string | null {
  const token = raw.toLocaleLowerCase("en-US");
  if (TOKEN_STOPWORDS.has(token)) return null;
  if (ABSENCE_TOKENS.has(token)) return "absence";
  if (MONTH_TOKENS[token] !== undefined) return MONTH_TOKENS[token];
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 5 && token.endsWith("ion")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function canonicalTokens(value: string): string[] {
  return (value.match(/[\p{L}]+/gu) ?? [])
    .map(canonicalToken)
    .filter((token): token is string => token !== null);
}

export function numericClaims(value: string): number[] {
  return (value.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [])
    .map((claim) => Number(claim.replaceAll(",", "")))
    .filter(Number.isFinite);
}
