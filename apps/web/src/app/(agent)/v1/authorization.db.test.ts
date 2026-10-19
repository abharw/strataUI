/**
 * Authorization over the HTTP surface. Every `/v1` write route is driven with a viewer
 * credential, so a route added without a scope guard fails here. Also pins write provenance.
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createGrant, issueTokenPair, revokeGrant } from "@/server/credentials";
import { createCredentialNamespace, type CredentialNamespace } from "@/test/namespace";

import { PUT as putPage, GET as listPages } from "./pages/route";
import { PATCH as patchPage, DELETE as deletePage, GET as getPage } from "./pages/[id]/route";
import { PATCH as patchSpec, PUT as rewriteSpec } from "./pages/[id]/spec/route";
import { POST as preflightPage } from "./pages/preflight/route";
import { GET as findInPage } from "./pages/[id]/find/route";
import { GET as pageSummary } from "./pages/[id]/summary/route";
import { POST as createSpace, GET as listSpaces } from "./spaces/route";
import { PATCH as patchSpace, DELETE as deleteSpace } from "./spaces/[id]/route";
import { POST as reserveAsset, GET as assetUsage } from "./assets/route";
import { GET as listDecisions } from "./decisions/route";

const BASE = "https://strata.test";

/** Smallest spec the validator accepts. */
const SPEC = {
  root: "root",
  answer: { verdict: "Everything is fine." },
  elements: {
    root: { type: "section", props: {}, children: ["state"] },
    state: { type: "metric", props: { label: "State", value: "Fine" }, children: [] },
  },
};

interface Credential {
  token: string;
  grantId: string;
}

const namespaces: string[] = [];

afterEach(async () => {
  // Grants, tokens, pages and logs all cascade from the namespace row.
  const db = getDb();
  while (namespaces.length > 0) {
    const id = namespaces.pop()!;
    await db.delete(schema.namespaces).where(eq(schema.namespaces.id, id));
  }
});

async function namespace(): Promise<CredentialNamespace> {
  const ns = await createCredentialNamespace({ baseUrl: BASE });
  namespaces.push(ns.namespace_id);
  return ns;
}

async function credential(
  namespaceId: string,
  kind: "writer" | "viewer",
  label: string,
): Promise<Credential> {
  const grant = await createGrant({
    namespaceId,
    kind,
    driver: "instinct",
    label,
    mode: "rotating",
  });
  const issued = await issueTokenPair(grant);
  return { token: issued.accessToken, grantId: grant.id };
}

function request(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function seed(token: string): Promise<{ pageId: string; spaceId: string }> {
  const created = await putPage(
    request("PUT", "/v1/pages", token, {
      space: { slug: "general", name: "General", emoji: "🗂️" },
      slug: "note",
      title: "Note",
      spec: SPEC,
      summary: "seeded",
    }),
  );
  expect(created.status).toBe(201);
  const page = (await created.json()) as { page_id: string; space_id: string };
  return { pageId: page.page_id, spaceId: page.space_id };
}

// Every `/v1` write route. New write routes must be listed here.
function mutatingRoutes(page: string, space: string) {
  return [
    {
      name: "PUT /v1/pages",
      call: (t: string) =>
        putPage(request("PUT", "/v1/pages", t, {
          space: { slug: "general", name: "General", emoji: "🗂️" },
          slug: "another-note",
          spec: SPEC,
          summary: "s",
        })),
    },
    {
      name: "POST /v1/pages/preflight",
      call: (t: string) => preflightPage(request("POST", "/v1/pages/preflight", t, { spec: SPEC })),
    },
    {
      name: "PATCH /v1/pages/:id",
      call: (t: string) => patchPage(request("PATCH", `/v1/pages/${page}`, t, { title: "x" }), params(page)),
    },
    {
      name: "DELETE /v1/pages/:id",
      call: (t: string) => deletePage(request("DELETE", `/v1/pages/${page}?confirm=true`, t), params(page)),
    },
    {
      name: "PATCH /v1/pages/:id/spec",
      call: (t: string) =>
        patchSpec(
          request("PATCH", `/v1/pages/${page}/spec`, t, {
            base_version: 1,
            ops: [{ op: "replace", path: "/answer/verdict", value: "Still fine." }],
            summary: "s",
          }),
          params(page),
        ),
    },
    {
      name: "PUT /v1/pages/:id/spec",
      call: (t: string) =>
        rewriteSpec(
          request("PUT", `/v1/pages/${page}/spec`, t, { base_version: 1, spec: SPEC, summary: "s" }),
          params(page),
        ),
    },
    {
      name: "POST /v1/spaces",
      call: (t: string) => createSpace(request("POST", "/v1/spaces", t, { slug: "s2", name: "Second" })),
    },
    {
      name: "PATCH /v1/spaces/:id",
      call: (t: string) => patchSpace(request("PATCH", `/v1/spaces/${space}`, t, { name: "Renamed" }), params(space)),
    },
    {
      name: "DELETE /v1/spaces/:id",
      call: (t: string) => deleteSpace(request("DELETE", `/v1/spaces/${space}?with_pages=true`, t), params(space)),
    },
    {
      name: "POST /v1/assets",
      call: (t: string) =>
        reserveAsset(request("POST", "/v1/assets", t, {
          filename: "a.png",
          media_type: "image/png",
          size_bytes: 16,
        })),
    },
  ];
}

function readRoutes(page: string) {
  return [
    { name: "GET /v1/pages", call: (t: string) => listPages(request("GET", "/v1/pages", t)) },
    { name: "GET /v1/pages/:id", call: (t: string) => getPage(request("GET", `/v1/pages/${page}`, t), params(page)) },
    {
      name: "GET /v1/pages/:id/find",
      call: (t: string) => findInPage(request("GET", `/v1/pages/${page}/find?component=metric`, t), params(page)),
    },
    {
      name: "GET /v1/pages/:id/summary",
      call: (t: string) => pageSummary(request("GET", `/v1/pages/${page}/summary`, t), params(page)),
    },
    { name: "GET /v1/spaces", call: (t: string) => listSpaces(request("GET", "/v1/spaces", t)) },
    { name: "GET /v1/assets", call: (t: string) => assetUsage(request("GET", "/v1/assets", t)) },
    { name: "GET /v1/decisions", call: (t: string) => listDecisions(request("GET", "/v1/decisions", t)) },
  ];
}

describe("a viewer credential", () => {
  it("is refused on every mutating route, with the scope named in the challenge", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt");
    const viewer = await credential(ns.namespace_id, "viewer", "strata-mobile");
    const { pageId, spaceId } = await seed(writer.token);

    for (const route of mutatingRoutes(pageId, spaceId)) {
      const response = await route.call(viewer.token);
      const body = (await response.json()) as { code?: string };
      expect(`${route.name}: ${String(response.status)}`).toBe(`${route.name}: 403`);
      expect(`${route.name}: ${String(body.code)}`).toBe(`${route.name}: insufficient_scope`);
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer error="insufficient_scope", scope="pages:write"',
      );
    }

    const [page] = await getDb().select({ version: schema.pages.version })
      .from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(page?.version).toBe(1);
  });

  it("reads everything a writer can read", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt");
    const viewer = await credential(ns.namespace_id, "viewer", "strata-mobile");
    const { pageId } = await seed(writer.token);

    for (const route of readRoutes(pageId)) {
      const response = await route.call(viewer.token);
      expect(`${route.name}: ${String(response.status)}`).toBe(`${route.name}: 200`);
    }
  });
});

describe("a writer credential", () => {
  it("writes, and the grant lands on the page and its write log", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt (work laptop)");
    const { pageId } = await seed(writer.token);

    const db = getDb();
    const [page] = await db
      .select({ grantId: schema.pages.lastWriterGrantId })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(page?.grantId).toBe(writer.grantId);

    const writes = await db
      .select({ grantId: schema.pageWrites.grantId })
      .from(schema.pageWrites)
      .where(eq(schema.pageWrites.pageId, pageId));
    expect(writes).toHaveLength(1);
    expect(writes[0]?.grantId).toBe(writer.grantId);
  });

  it("shows the grant's label as the page's writer in the read model", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt (work laptop)");
    const { pageId } = await seed(writer.token);

    const read = await getPage(request("GET", `/v1/pages/${pageId}`, writer.token), params(pageId));
    const body = (await read.json()) as { meta: Record<string, unknown> };
    expect(body.meta.last_writer).toBe("chatgpt (work laptop)");
    expect(body.meta.last_writer_grant_id).toBe(writer.grantId);

    const listed = await listPages(request("GET", "/v1/pages", writer.token));
    const pages = ((await listed.json()) as { pages: Record<string, unknown>[] }).pages;
    expect(pages[0]?.last_writer).toBe("chatgpt (work laptop)");
  });

  it("records the exposure flip against its grant", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt");
    const { pageId } = await seed(writer.token);

    const shared = await patchPage(
      request("PATCH", `/v1/pages/${pageId}`, writer.token, { shared: true }),
      params(pageId),
    );
    expect(shared.status).toBe(200);

    const [row] = await getDb()
      .select({ grantId: schema.exposureLog.grantId })
      .from(schema.exposureLog)
      .where(eq(schema.exposureLog.pageId, pageId));
    expect(row?.grantId).toBe(writer.grantId);
  });
});

describe("a credential that does not verify", () => {
  it("is refused with 401 and the realm challenge when the grant is revoked", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt");
    await revokeGrant(writer.grantId, "owner");

    const response = await listPages(request("GET", "/v1/pages", writer.token));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="strata"');
  });

  it("is refused with 401 when the access token has expired", async () => {
    const ns = await namespace();
    const grant = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "writer",
      driver: "instinct",
      label: "chatgpt",
      mode: "rotating",
    });
    const issued = await issueTokenPair(grant, {
      now: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    const response = await listPages(request("GET", "/v1/pages", issued.accessToken));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="strata"');
  });

  it("says the same thing for revoked, expired, and unknown — no probing oracle", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt");
    await revokeGrant(writer.grantId, "owner");

    const revoked = await listPages(request("GET", "/v1/pages", writer.token));
    const unknown = await listPages(request("GET", "/v1/pages", `sw_${"a".repeat(43)}`));
    expect(await revoked.json()).toEqual(await unknown.json());
  });

  // The 401 body is what the agent relays to the person, so it must not blame the Strata.
  it("tells a revoked agent the Strata is fine and how to ask for access again", async () => {
    const ns = await namespace();
    const writer = await credential(ns.namespace_id, "writer", "chatgpt");
    await revokeGrant(writer.grantId, "owner");

    const body = (await (await listPages(request("GET", "/v1/pages", writer.token))).json()) as {
      error: string;
      next: string[];
    };
    expect(body.error).toContain("The person's Strata and every page in it are unaffected");
    // States the refusal without disclosing whether the grant expired or was revoked.
    expect(body.error).not.toContain("(expired or revoked)");
    // Operation ids: refresh first, then restart auth from the person's email.
    expect(body.next).toEqual(["refresh_credential", "start_auth"]);
    expect(body.next).not.toContain("accept_join_code");
  });

  it("refuses an unrecognised prefix with 401, not a 500 or a lookup", async () => {
    for (const token of ["nonsense", "sr_a-refresh-token", `sk_${"a".repeat(43)}`]) {
      const response = await listPages(request("GET", "/v1/pages", token));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer realm="strata"');
    }
  });
});
