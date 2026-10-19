/** The `Link` header for public documents; separate so the proxy bundle skips the OpenAPI generator. */
export const SERVICE_LINK_HEADER = [
  '</llms.txt>; rel="service-doc"; type="text/markdown"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '</.well-known/strata.json>; rel="service-meta"; type="application/json"',
].join(", ");
