import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /robots.txt", () => {
  it("allows everything and points an agent at the machine-readable door", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("# Agents: start at /llms.txt");
  });

  it("disallows nothing and lists no sitemap", async () => {
    const body = await GET().text();
    // A `Disallow` would advertise the capability URL shape; noindex is enforced by headers.
    expect(body).not.toContain("Disallow");
    expect(body).not.toContain("Sitemap");
  });
});
