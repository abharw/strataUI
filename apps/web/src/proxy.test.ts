import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SERVICE_LINK_HEADER } from "@/server/api/discovery/link-header";
import { WEB_SESSION_COOKIE } from "@/server/auth/session-cookie";
import { config, NON_DOCUMENT_SEGMENTS, OWNER_JSON_SEGMENTS, proxy } from "./proxy";

const ORIGIN = "https://strata.test";
const UUID = "11111111-2222-4333-8444-555555555555";
const PAGE_KEY = `pgk_${"b".repeat(43)}`;
const SPACE_KEY = `spk_${"c".repeat(43)}`;
const SIGN_IN_PATH = "/home/sign-in";

function visit(path: string, method = "GET") {
  return proxy(new NextRequest(new URL(path, ORIGIN), { method }));
}

function visitSignedIn(path: string) {
  return proxy(new NextRequest(new URL(path, ORIGIN), {
    headers: { cookie: `${WEB_SESSION_COOKIE}=s` },
  }));
}

/** A redirect's Location as path plus query. */
function landing(response: Response): string {
  const url = new URL(response.headers.get("location") ?? "", ORIGIN);
  return `${url.pathname}${url.search}`;
}

describe("a browser with no session", () => {
  it("is sent to sign-in with a way back, as a real 307 and not a streamed skeleton", () => {
    for (const path of ["/home", `/spaces/${UUID}`, `/pages/${UUID}`]) {
      const response = visit(path);
      expect(response.status).toBe(307);
      expect(landing(response)).toBe(`/home/sign-in?next=${encodeURIComponent(path)}`);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("answers the sign-in redirect as a private page", () => {
    const response = visit(`/pages/${UUID}`);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("keeps the query on the way back", () => {
    expect(landing(visit("/home?tab=recent"))).toBe(`/home/sign-in?next=${encodeURIComponent("/home?tab=recent")}`);
  });

  it("leaves sign-in, share links, and an action post alone", () => {
    for (const path of [SIGN_IN_PATH, `/share/${SPACE_KEY}`, `/share/${PAGE_KEY}`, "/"]) {
      expect(visit(path).headers.get("location")).toBeNull();
    }
    // Redirecting a Server Action POST would swallow a sign-out that is clearing the cookie.
    expect(visit("/home", "POST").headers.get("location")).toBeNull();
  });
});

describe("a browser with a session", () => {
  it("goes straight through to Home, query and all", () => {
    expect(visitSignedIn("/home").headers.get("location")).toBeNull();
    expect(visitSignedIn("/home?tab=recent").headers.get("location")).toBeNull();
  });
});

describe("root service discovery headers", () => {
  it("advertises the agent door on every human surface, not just the root", () => {
    for (const path of [
      "/home",
      `/pages/${UUID}`,
      `/spaces/${UUID}`,
      `/share/${PAGE_KEY}`,
    ]) {
      expect(visitSignedIn(path).headers.get("link"), path).toBe(SERVICE_LINK_HEADER);
    }
    expect(visitSignedIn("/dev/home").headers.get("link")).toBeNull();
  });

  it("advertises agent docs, OpenAPI, and structured metadata", () => {
    const response = visit("/");
    expect(response.headers.get("link")).toBe(SERVICE_LINK_HEADER);
    expect(response.headers.get("link")).toContain('rel="service-doc"');
    expect(response.headers.get("link")).toContain('rel="service-desc"');
    expect(response.headers.get("link")).toContain('rel="service-meta"');
  });

  it("keeps every private surface out of every index and every cache", () => {
    for (const path of [
      "/home",
      `/pages/${UUID}`,
      `/spaces/${UUID}`,
      `/share/${PAGE_KEY}`,
      `/share/${SPACE_KEY}/pages/${UUID}`,
      "/home/sign-in",
    ]) {
      const response = visit(path);
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex");
      expect(response.headers.get("cache-control"), path).toContain("no-store");
    }
  });
});

describe("framing and form-action policy", () => {
  it("refuses to be framed on every owner surface", () => {
    for (const path of ["/home", `/pages/${UUID}`, `/spaces/${UUID}`]) {
      const csp = visitSignedIn(path).headers.get("content-security-policy") ?? "";
      // A framed page passes the Origin check, so framing would allow UI redressing.
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("base-uri 'none'");
      expect(csp, path).toContain("form-action 'self'");
    }
  });

  it("leaves /share framable, because ?embed=1 is a deliberate embed surface", () => {
    expect(visit(`/share/${PAGE_KEY}`).headers.get("content-security-policy")).toBeNull();
  });
});

describe("what the proxy is asked to run on", () => {
  function documentOnly(prefix: string): RegExp {
    const entry = config.matcher.find((source) => source.startsWith(`${prefix}/`));
    return new RegExp(`^${entry!}$`);
  }

  it("runs on the documents", () => {
    expect(documentOnly("/pages").test(`/pages/${UUID}`)).toBe(true);
    expect(documentOnly("/share").test(`/share/${PAGE_KEY}`)).toBe(true);
    expect(documentOnly("/share").test(`/share/${SPACE_KEY}/pages/${UUID}`)).toBe(true);
  });

  it("stays out of the poll endpoints an open tab hits every three seconds", () => {
    expect(documentOnly("/pages").test(`/pages/${UUID}/changes`)).toBe(false);
    expect(documentOnly("/share").test(`/share/${PAGE_KEY}/changes`)).toBe(false);
  });

  it("stays out of the two JSON reads an open Home polls, for the same reason", () => {
    // Their handlers set their own headers, including `no-referrer`.
    expect(documentOnly("/home").test("/home/agents")).toBe(false);
    expect(documentOnly("/home").test("/home/search")).toBe(false);
  });

  it("still runs on sign-in, whose two steps are Server Action posts", () => {
    expect(documentOnly("/home").test(SIGN_IN_PATH)).toBe(true);
  });

  it("runs on the document again now that its JSON siblings are actions", () => {
    // Server Actions post to the document's own address, which needs the proxy's headers.
    expect(documentOnly("/pages").test(`/pages/${UUID}/decisions`)).toBe(true);
    expect(documentOnly("/pages").test(`/pages/${UUID}/user`)).toBe(true);
  });

  it("still covers the addresses that are hit once per render, not per tick", () => {
    expect(documentOnly("/pages").test(`/pages/${UUID}/assets/report.pdf`)).toBe(true);
    expect(documentOnly("/share").test(`/share/${PAGE_KEY}/og/image`)).toBe(true);
  });
});

// Under `no-referrer` a browser posts `Origin: null`, which Next's action CSRF check refuses.
describe("/home/sign-in", () => {
  it("keeps its own origin as referrer so its own form post is accepted", () => {
    const response = visit("/home/sign-in");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("keeps every owner surface on same-origin, because they all post actions", () => {
    for (const path of ["/home", `/spaces/${UUID}`, `/pages/${UUID}`]) {
      expect(visitSignedIn(path).headers.get("referrer-policy"), path).toBe("same-origin");
    }
  });

  it("leaves share links on no-referrer: the address is the capability", () => {
    expect(visit(`/share/${PAGE_KEY}`).headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("the matcher literals", () => {
  it("spell out exactly the non-document segments the proxy skips", () => {
    const expected = `((?!.*/(?:${NON_DOCUMENT_SEGMENTS.join("|")})(?:/|$)).*)`;
    for (const prefix of ["/pages", "/share"]) {
      expect(config.matcher).toContain(`${prefix}/${expected}`);
    }
  });

  it("spell out exactly the owner JSON reads the proxy skips", () => {
    // Direct children of `/home`, so the segment is also excluded with nothing in front of it.
    expect(config.matcher).toContain(
      `/home/((?!(?:.*/)?(?:${OWNER_JSON_SEGMENTS.join("|")})(?:/|$)).*)`,
    );
  });
});
