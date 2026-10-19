/**
 * A route handler because Next's `robots.ts` cannot emit the comment that points agents at
 * /llms.txt. Nothing is disallowed: a `Disallow` would advertise the capability URL shape, and
 * noindex is enforced by headers and metadata. No sitemap, since every real URL is keyed.
 */
const BODY = `# Agents: start at /llms.txt
User-agent: *
Allow: /
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
