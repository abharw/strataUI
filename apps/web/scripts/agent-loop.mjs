#!/usr/bin/env node
// End-to-end agent flow against a live deployment: discovery, email-code connect, page writes,
// a static credential, owner reads (with --session), and refresh last since reuse detection
// revokes the grant. Creates real data. Usage: node scripts/agent-loop.mjs <BASE_URL> --email <addr>

import { writeFileSync, readFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";

// Verifying the same address twice opens the same Strata, so slugs need a per-run suffix.
const RUN = Date.now().toString(36);

// Minimal page that passes the authoring quality gate: `answer.verdict`, `slug` and `title`.
const DEFAULT_PAGE_BODY = {
  space: { slug: "agent-loop", name: "Agent loop", emoji: "📋" },
  slug: `agent-loop-${RUN}`,
  title: "Agent loop",
  summary: "Created the agent loop page.",
  spec: {
    root: "root",
    answer: { verdict: "Agent loop smoke spec." },
    elements: {
      root: { type: "section", props: {}, children: ["item-1"] },
      "item-1": { type: "callout", props: { text: "hello" }, children: [] },
    },
  },
};


function usage() {
  console.error(
    [
      "usage:",
      "  node scripts/agent-loop.mjs <BASE_URL> --email <address> [--code <digits> …]",
      "  node scripts/agent-loop.mjs <BASE_URL> --skip-auth --access-token sw_… [--refresh-token sr_…]",
      "",
      "  --session <ows_…>       an owner-session secret; the owner phases are skipped without one",
      "  --vault <path>          default ./.strata-vault.json",
      "  --page-body <file.json> replace the smoke page",
      "",
      "Codes may also come from STRATA_TEST_CODE (comma-separated). A run",
      "spends one, at /v1/auth/verify.",
      "Never use an @example.com address; the WorkOS sandbox sends it to SSO.",
    ].join("\n"),
  );
}

function readArguments(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(2),
      allowPositionals: true,
      options: {
        vault: { type: "string", default: "./.strata-vault.json" },
        "page-body": { type: "string" },
        email: { type: "string" },
        code: { type: "string", multiple: true, default: [] },
        "skip-auth": { type: "boolean", default: false },
        "access-token": { type: "string" },
        "refresh-token": { type: "string" },
        session: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    usage();
    process.exit(1);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    usage();
    process.exit(0);
  }

  // Codes come from repeated flags, comma lists, or the environment, spent in order.
  const codes = [...values.code, process.env.STRATA_TEST_CODE ?? ""]
    .flatMap((value) => String(value).split(","))
    .map((code) => code.trim())
    .filter((code) => code !== "");

  const baseUrl = positionals[0];
  const email = values.email ?? process.env.STRATA_TEST_EMAIL ?? null;
  const accessToken = values["access-token"] ?? null;
  if (!baseUrl) {
    usage();
    process.exit(1);
  }
  if (values["skip-auth"] && !accessToken) {
    console.error("--skip-auth needs --access-token sw_…");
    process.exit(1);
  }
  if (!values["skip-auth"] && !email) {
    console.error("--email <address> is required (or --skip-auth --access-token sw_…)");
    process.exit(1);
  }
  // The WorkOS sandbox routes @example.com to SSO, so no code would arrive.
  if (email !== null && /@example\.(com|org|net)$/i.test(email)) {
    console.error("refusing @example.com: the WorkOS sandbox routes it to SSO and no code arrives");
    process.exit(1);
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    vaultPath: values.vault,
    pageBodyPath: values["page-body"] ?? null,
    email,
    skipAuth: values["skip-auth"],
    accessToken,
    refreshToken: values["refresh-token"] ?? null,
    sessionSecret: values.session ?? null,
    codes,
  };
}

function saveVault(path, vault) {
  writeFileSync(path, JSON.stringify(vault, null, 2), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX permission bits.
  }
}

let BASE_URL;

// One-time codes, spent in order. Each code is single use.
let CODES = [];

async function nextCode(purpose) {
  const queued = CODES.shift();
  if (queued !== undefined) return queued;
  if (!stdin.isTTY) {
    throw new AssertionError(
      `out of one-time codes (needed one for ${purpose}); pass another --code or set STRATA_TEST_CODE`,
    );
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`  code for ${purpose}: `);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function call(method, path, opts = {}) {
  const { token, body, headers, redirect } = opts;
  const finalHeaders = { ...(headers || {}) };
  let payload;
  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: payload,
    // "manual" keeps a redirect and its Set-Cookie observable instead of following it.
    redirect: redirect ?? "follow",
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text, headers: res.headers };
}

class AssertionError extends Error {}

function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

function assertStatus(res, expectedStatus, label) {
  assert(
    res.status === expectedStatus,
    `${label}: expected ${expectedStatus}, got ${res.status} (${res.text.slice(0, 300)})`,
  );
}

// Ambiguous-failure endpoints answer `{ error, code }` with both set to the same string.
function assertErrorCode(res, expectedStatus, expectedCode, label) {
  assertStatus(res, expectedStatus, label);
  assert(
    res.json?.error === expectedCode,
    `${label}: expected body.error === "${expectedCode}", got ${JSON.stringify(res.json?.error)}`,
  );
  assert(
    res.json?.code === expectedCode,
    `${label}: expected body.code === "${expectedCode}", got ${JSON.stringify(res.json?.code)}`,
  );
}

// RFC 6750 §3: every 401 carries this challenge.
function assertBearerRealmChallenge(res, label) {
  assertStatus(res, 401, label);
  assert(
    res.headers.get("www-authenticate") === 'Bearer realm="strata"',
    `${label}: expected WWW-Authenticate: Bearer realm="strata", got ${JSON.stringify(res.headers.get("www-authenticate"))}`,
  );
}

function extractAgentList(json) {
  return Array.isArray(json?.agents) ? json.agents : [];
}

// `PUT /v1/pages` returns the page's `/share/:pgk` link as `url`.
function pathFromPageUrl(url) {
  return new URL(url).pathname;
}

function extractPageId(json) {
  return json?.page_id ?? null;
}

function extractVersion(json) {
  return json?.version ?? null;
}

// Owner session cookie. Never logged.
const SESSION_COOKIE = "__Host-strata_session";


const results = [];

async function phase(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.log(`FAIL - ${name}: ${err.message}`);
    printSummary();
    process.exit(1);
  }
}

function skip(name, why) {
  results.push({ name, ok: true, skipped: true });
  console.log(`skip - ${name} (${why})`);
}

function printSummary() {
  const skipped = results.filter((r) => r.skipped).length;
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("");
  console.log(`${passed}/${results.length} phases passed, ${skipped} skipped, ${failed} failed`);
}

/**
 * Connects as /auth.md describes. `start` answers 202 identically for known and unknown
 * addresses to avoid account enumeration, so nothing here branches on it.
 */
async function connect(email, driver, label) {
  const started = await call("POST", "/v1/auth/start", { body: { email, driver, label } });
  assertStatus(started, 202, "POST /v1/auth/start");
  assert(started.json?.expires_in === 600, `start returned expires_in ${JSON.stringify(started.json?.expires_in)}`);
  assert(
    Array.isArray(started.json?.next) && started.json.next.includes("verify_auth"),
    `start did not point at verify_auth: ${JSON.stringify(started.json?.next)}`,
  );
  assert(started.json?.access_token === undefined, "start leaked a credential");

  const code = await nextCode(`${label}'s /v1/auth/verify`);
  const verified = await call("POST", "/v1/auth/verify", { body: { email, code, driver, label } });
  assertStatus(verified, 201, "POST /v1/auth/verify");
  const j = verified.json;
  assert(j?.namespace_id, "POST /v1/auth/verify response missing namespace_id");
  assert(j?.namespace_display_name, "POST /v1/auth/verify response missing namespace_display_name");
  assert(j?.grant_id, "POST /v1/auth/verify response missing grant_id");
  assert(String(j?.access_token).startsWith("sw_"), "verify did not return a writer access token");
  assert(String(j?.refresh_token).startsWith("sr_"), "verify did not return a refresh token");
  return {
    namespace_id: j.namespace_id,
    namespace_display_name: j.namespace_display_name,
    grant_id: j.grant_id,
    access_token: j.access_token,
    refresh_token: j.refresh_token,
  };
}


async function main() {
  const options = readArguments(process.argv);
  BASE_URL = options.baseUrl;
  CODES = options.codes;
  const resolvedVaultPath = resolve(options.vaultPath);

  let pageBody = DEFAULT_PAGE_BODY;
  if (options.pageBodyPath) {
    pageBody = JSON.parse(readFileSync(resolve(options.pageBodyPath), "utf8"));
  }

  console.log(`agent-loop: target ${BASE_URL}`);
  if (options.skipAuth) console.log("agent-loop: --skip-auth, driving a credential that was minted elsewhere");

  const vault = {};

  // --- 1. Discovery --------------------------------------------------------
  await phase("discovery: /auth.md and /.well-known/strata.json", async () => {
    const doc = await call("GET", "/auth.md");
    assertStatus(doc, 200, "GET /auth.md");
    const body = doc.text ?? "";
    assert(body.includes("/v1/auth/start"), "/auth.md does not name /v1/auth/start");
    assert(body.includes("/v1/auth/verify"), "/auth.md does not name /v1/auth/verify");
    assert(
      body.indexOf("/v1/auth/start") < body.indexOf("/v1/auth/verify"),
      "/auth.md names the two calls out of order",
    );

    const meta = await call("GET", "/.well-known/strata.json");
    assertStatus(meta, 200, "GET /.well-known/strata.json");
    assert(
      meta.json?.agent_auth?.kind === "email_code",
      `agent_auth.kind is ${JSON.stringify(meta.json?.agent_auth?.kind)}, expected "email_code"`,
    );
    assert(
      meta.json.agent_auth.start === `${BASE_URL}/v1/auth/start`
      && meta.json.agent_auth.verify === `${BASE_URL}/v1/auth/verify`,
      "agent_auth does not carry both halves of the door as absolute URLs",
    );
  });

  // --- 2. Connect ----------------------------------------------------------
  if (options.skipAuth) {
    skip("connect: POST /v1/auth/start then /v1/auth/verify", "--skip-auth");
    vault.instinct = {
      access_token: options.accessToken,
      refresh_token: options.refreshToken ?? null,
    };
  } else {
    await phase("connect: POST /v1/auth/start then /v1/auth/verify", async () => {
      vault.instinct = await connect(options.email, "instinct", "instinct");
      saveVault(resolvedVaultPath, vault);
      console.log(
        `  connected to "${vault.instinct.namespace_display_name}" (${vault.instinct.namespace_id})`,
      );

      // An unknown driver is refused before any mail is sent, listing the accepted set.
      const badDriver = await call("POST", "/v1/auth/start", {
        body: { email: options.email, driver: "not-a-driver", label: "x" },
      });
      assertStatus(badDriver, 422, "POST /v1/auth/start (unknown driver)");
      assert(
        badDriver.json?.code === "invalid_driver" && Array.isArray(badDriver.json?.valid),
        `expected invalid_driver with a valid list, got ${JSON.stringify(badDriver.json)}`,
      );

      // A wrong code answers generically and names the call that gets a fresh one.
      const wrong = await call("POST", "/v1/auth/verify", {
        body: { email: options.email, code: "000000", driver: "instinct", label: "instinct" },
      });
      assertErrorCode(wrong, 400, "invalid_code", "POST /v1/auth/verify (wrong code)");
      assert(
        wrong.json?.recover?.method === "POST"
        && /^https?:\/\/.+\/v1\/auth\/start$/.test(wrong.json?.recover?.path ?? ""),
        `invalid_code carries no absolute recover call: ${JSON.stringify(wrong.json?.recover)}`,
      );
    });
  }

  // --- 3. Write ------------------------------------------------------------
  await phase("write: guide + pages", async () => {
    const guide = await call("GET", "/v1/guide?topic=authoring", { token: vault.instinct.access_token });
    assertStatus(guide, 200, "GET /v1/guide");

    const created = await call("PUT", "/v1/pages", { token: vault.instinct.access_token, body: pageBody });
    assertStatus(created, 201, "PUT /v1/pages");
    const pageId = extractPageId(created.json);
    assert(pageId, "PUT /v1/pages did not return page_id");
    vault.instinct.first_page_id = pageId;
    vault.instinct.namespace_id ??= created.json?.namespace_id ?? null;

    const fetched = await call("GET", `/v1/pages/${pageId}`, { token: vault.instinct.access_token });
    assertStatus(fetched, 200, "GET /v1/pages/:id");
    const version = extractVersion(fetched.json);
    assert(version !== null, "GET /v1/pages/:id did not return a version");

    // The summary must not duplicate the new prop text (summary_body_duplication).
    const patch = await call("PATCH", `/v1/pages/${pageId}/spec`, {
      token: vault.instinct.access_token,
      body: {
        base_version: version,
        summary: "Patched the greeting text.",
        ops: [{ op: "replace", path: "/elements/item-1/props/text", value: "hello, patched" }],
      },
    });
    assertStatus(patch, 200, "PATCH /v1/pages/:id/spec");
    assert(
      extractVersion(patch.json) === version + 1,
      `PATCH /v1/pages/:id/spec expected version ${version + 1}, got ${extractVersion(patch.json)}`,
    );
  });
  saveVault(resolvedVaultPath, vault);

  // --- 4. A second agent that can only hold a fixed key --------------------
  // For clients that can only hold a static API key, such as a custom GPT or a webhook.
  await phase("second agent: POST /v1/credentials/static", async () => {
    const minted = await call("POST", "/v1/credentials/static", {
      token: vault.instinct.access_token,
      body: { driver: "chatgpt", label: "chatgpt" },
    });
    assertStatus(minted, 201, "POST /v1/credentials/static");
    const cj = minted.json;
    assert(String(cj?.access_token).startsWith("sw_"), "static mint did not return a writer token");
    assert(cj?.mode === "static", `expected mode "static", got ${JSON.stringify(cj?.mode)}`);
    assert(cj?.refresh_token === null, "a static credential must carry refresh_token: null");
    assert(cj?.expires_in === null, "a static credential must carry expires_in: null");
    vault.chatgpt = { grant_id: cj.grant_id, access_token: cj.access_token };

    const write = await call("PUT", "/v1/pages", {
      token: vault.chatgpt.access_token,
      body: { ...pageBody, slug: `agent-loop-static-${RUN}` },
    });
    assertStatus(write, 201, "chatgpt PUT /v1/pages");

    // Static credentials never expire and have no refresh token.
    const refused = await call("POST", "/v1/auth/refresh", { body: { refresh_token: "sr_not-a-token" } });
    assertErrorCode(refused, 400, "invalid_grant", "refreshing a token Strata never issued");
  });
  saveVault(resolvedVaultPath, vault);

  // --- 5. The browser's own session -----------------------------------------
  // Sign-in is a pair of Server Actions with no postable address, so the session is supplied.
  let owner = null;
  if (options.sessionSecret === null) {
    skip("browser: an owner session", "--session was not given");
  } else {
    owner = { header: `${SESSION_COOKIE}=${options.sessionSecret}`, attributes: "(supplied)" };
    await phase("browser: an owner session opens Home, and nothing else does", async () => {
      const home = await call("GET", "/home", { headers: { cookie: owner.header } });
      assertStatus(home, 200, "GET /home with the supplied session");

      // With no session, /home redirects to sign-in rather than 404ing.
      const stranger = await call("GET", "/home", { redirect: "manual" });
      assert(
        stranger.status === 307 || stranger.status === 303,
        `GET /home with no session: expected a redirect, got ${stranger.status}`,
      );
      assert(
        new URL(stranger.headers.get("location") ?? "", BASE_URL).pathname === "/home/sign-in",
        `GET /home with no session went to ${JSON.stringify(stranger.headers.get("location"))}`,
      );
    });
  }

  // --- 6. Owner routes -----------------------------------------------------
  if (owner === null) {
    skip("owner routes: connected agents", "no browser session (--session)");
  } else {
    await phase("owner routes: connected agents", async () => {
      const ownerCall = (method, path, opts = {}) => call(method, path, {
        ...opts,
        headers: { ...(opts.headers || {}), cookie: owner.header, origin: BASE_URL },
      });

      const listed = await ownerCall("GET", "/home/agents");
      assertStatus(listed, 200, "GET /home/agents");
      const agents = extractAgentList(listed.json);
      const labels = agents.map((g) => g.label);
      assert(labels.includes("instinct"), `expected an "instinct" grant, got labels: ${JSON.stringify(labels)}`);
      assert(labels.includes("chatgpt"), `expected a "chatgpt" grant, got labels: ${JSON.stringify(labels)}`);
      // The static grant records its issuer. Under --skip-auth the issuer id is unknown.
      const chatgpt = agents.find((g) => g.grant_id === vault.chatgpt.grant_id);
      assert(
        vault.instinct.grant_id === undefined
          ? typeof chatgpt?.issued_by_grant_id === "string"
          : chatgpt?.issued_by_grant_id === vault.instinct.grant_id,
        `the static grant does not name its issuer: ${JSON.stringify(chatgpt?.issued_by_grant_id)}`,
      );

      // Disconnecting is a Server Action, covered by src/app/(owner)/home/credential-routes.db.test.ts.

      assert(!/\b(?:sw|sv|sr)_/.test(listed.text), "GET /home/agents reflected credential material back");
    });
  }

  // --- 7. The owner's own view of a page -----------------------------------
  if (owner === null) {
    skip("owner session: share link and canonical address", "no browser session (--session)");
  } else {
    await phase("owner session: share link and canonical address", async () => {
      const created = await call("PUT", "/v1/pages", {
        token: vault.instinct.access_token,
        body: { ...pageBody, slug: `agent-loop-session-${RUN}` },
      });
      assertStatus(created, 201, "PUT /v1/pages (owner session)");
      const pagePath = pathFromPageUrl(created.json.url);
      const pageId = extractPageId(created.json);
      // The share link carries only the key, no page id to correlate.
      assert(
        /^\/share\/pgk_[A-Za-z0-9_-]{43}$/.test(pagePath),
        `page url is not a /share link: ${pagePath}`,
      );
      assert(!pagePath.includes(pageId), "the share link still names the page it opens");

      // With the cookie, the share link redirects to the canonical address.
      const asOwner = await call("GET", pagePath, {
        headers: { cookie: owner.header },
        redirect: "manual",
      });
      assertStatus(asOwner, 307, "GET /share/:key with the session cookie");
      assert(
        new URL(asOwner.headers.get("location") ?? "", BASE_URL).pathname === `/pages/${pageId}`,
        `expected /pages/${pageId}, got ${JSON.stringify(asOwner.headers.get("location"))}`,
      );

      const canonical = await call("GET", `/pages/${pageId}`, { headers: { cookie: owner.header } });
      assertStatus(canonical, 200, "GET /pages/:id with the session cookie");
      assert(
        canonical.text.includes('href="/spaces/'),
        "the canonical page did not render the Space back link for the signed-in browser",
      );

      // Without a cookie, the share link renders the reader view.
      const asReader = await call("GET", pagePath, { redirect: "manual" });
      assertStatus(asReader, 200, "GET /share/:key without a cookie");
      assert(
        !asReader.text.includes('href="/spaces/'),
        "a share link rendered owner chrome for a browser with no session",
      );

      // The canonical address with no session redirects to sign-in.
      const strangerAtCanonical = await call("GET", `/pages/${pageId}`, { redirect: "manual" });
      assertStatus(strangerAtCanonical, 307, "GET /pages/:id with no session");
      const door = new URL(strangerAtCanonical.headers.get("location") ?? "", BASE_URL);
      assert(
        door.pathname === "/home/sign-in" && door.searchParams.get("next") === `/pages/${pageId}`,
        `expected /home/sign-in?next=/pages/${pageId}, got ${JSON.stringify(strangerAtCanonical.headers.get("location"))}`,
      );

    });
  }

  // --- 8. Refresh ----------------------------------------------------------
  // Runs last: proving reuse detection revokes the grant every phase above uses.
  if (!vault.instinct.refresh_token) {
    skip("refresh: rotate, reuse detection, recovery", "no refresh token (--skip-auth without --refresh-token)");
  } else {
    await phase("refresh: rotate, reuse detection, recovery", async () => {
      const oldAccess = vault.instinct.access_token;
      const oldRefresh = vault.instinct.refresh_token;

      const rotated = await call("POST", "/v1/auth/refresh", { body: { refresh_token: oldRefresh } });
      assertStatus(rotated, 200, "POST /v1/auth/refresh");
      const newAccess = rotated.json?.access_token;
      assert(newAccess, "POST /v1/auth/refresh response missing access_token");
      assert(rotated.json?.refresh_token, "POST /v1/auth/refresh response missing refresh_token");

      // Rotation immediately revokes the access token issued with the spent refresh token.
      const oldAccessCheck = await call("GET", "/v1/pages", { token: oldAccess });
      assertBearerRealmChallenge(oldAccessCheck, "old access token after refresh");

      const replayed = await call("POST", "/v1/auth/refresh", { body: { refresh_token: oldRefresh } });
      assertErrorCode(replayed, 400, "invalid_grant", "replaying the old refresh token");

      // An agent without a credential cannot read the docs, so the body carries the recovery
      // call and the contract version.
      const dead = replayed.json ?? {};
      assert(
        typeof dead.contract_version === "string" && dead.contract_version.length > 0,
        `invalid_grant body is missing contract_version: ${JSON.stringify(dead)}`,
      );
      assert(
        replayed.headers?.get("x-strata-contract") === dead.contract_version,
        "X-Strata-Contract does not match the contract_version in the body",
      );
      assert(
        dead.recover?.method === "POST" && /^https?:\/\/.+\/v1\/auth\/start$/.test(dead.recover?.path ?? ""),
        `invalid_grant does not point at the email door: ${JSON.stringify(dead.recover)}`,
      );
      assert(
        typeof dead.recover?.then === "string" && typeof dead.avoid === "string",
        `invalid_grant body is missing recover.then or avoid: ${JSON.stringify(dead)}`,
      );
      assert(
        typeof dead.error_description === "string" && /still exist/.test(dead.error_description),
        `invalid_grant does not say the person's Strata survived: ${JSON.stringify(dead.error_description)}`,
      );

      // Reuse detection revokes the whole grant, including the token the first refresh issued.
      const newAccessCheck = await call("GET", "/v1/pages", { token: newAccess });
      assertBearerRealmChallenge(newAccessCheck, "new access token after reuse-detection kill");
      console.log("  reuse detection killed the grant; the way back is /v1/auth/start");
    });
  }

  saveVault(resolvedVaultPath, vault);

  console.log("");
  if (vault.instinct.namespace_id) console.log(`namespace: ${vault.instinct.namespace_id}`);
  console.log(`home: ${BASE_URL}/home`);

  printSummary();
  process.exit(0);
}

main().catch((err) => {
  console.error(`FAIL - unhandled error: ${err.stack ?? err.message}`);
  printSummary();
  process.exit(1);
});
