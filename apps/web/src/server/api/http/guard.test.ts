import { describe, expect, it } from "vitest";

import { CONTRACT_CHANGES, CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";
import { ok } from "@/shared/api/types";
import { MISSING_CONTRACT_WARNING } from "./contract";
import { guard, redact, redactError } from "./guard";

interface GuardBody {
  code: string;
  learned: string;
  contract_version: string;
  changes: string[];
  warnings: string[];
  recover: { path: string };
  avoid: string;
}

const ran = async () => ok({ warnings: ["existing"], page_id: "p" }, 201);

function request(method: string, headers: Record<string, string> = {}): Request {
  return new Request("https://strata.test/v1/pages", { method, headers });
}

describe("guard: the contract a write names", () => {
  it("refuses a write naming an older contract before the body runs, with what moved", async () => {
    let executed = false;
    const response = await guard(request("PUT", { [CONTRACT_HEADER]: "2026-09-05.2" }), async () => {
      executed = true;
      return ok({});
    });
    const body = await response.json() as GuardBody;
    expect(executed).toBe(false);
    expect(response.status).toBe(409);
    expect(body.code).toBe("contract_changed");
    expect(body.learned).toBe("2026-09-05.2");
    expect(body.contract_version).toBe(CONTRACT_VERSION);
    // Only versions newer than the learned one, oldest first.
    expect(body.changes).toEqual(
      CONTRACT_CHANGES.filter((change) => change.version > "2026-09-05.2").map((c) => `${c.version}: ${c.note}`),
    );
    expect(body.changes.length).toBeGreaterThan(0);
    expect(body.recover.path).toBe("https://strata.test/v1/guide");
    expect(body.avoid).toContain("Do not resend");
  });

  it("treats a value that is not a version as older than everything", async () => {
    const response = await guard(request("POST", { [CONTRACT_HEADER]: "latest" }), ran);
    const body = await response.json() as GuardBody;
    expect(response.status).toBe(409);
    expect(body.changes).toHaveLength(CONTRACT_CHANGES.length);
  });

  it("runs a write naming the current contract, unwarned", async () => {
    const response = await guard(request("PUT", { [CONTRACT_HEADER]: CONTRACT_VERSION }), ran);
    const body = await response.json() as GuardBody;
    expect(response.status).toBe(201);
    expect(body.warnings).toEqual(["existing"]);
  });

  it("runs a write naming no contract, with the warning first", async () => {
    const response = await guard(request("PATCH"), ran);
    const body = await response.json() as GuardBody;
    expect(response.status).toBe(201);
    expect(Object.keys(body)[0]).toBe("warnings");
    expect(body.warnings).toEqual([MISSING_CONTRACT_WARNING, "existing"]);
  });

  it("never refuses or warns a read", async () => {
    const stale = await guard(request("GET", { [CONTRACT_HEADER]: "2026-09-05.2" }), async () => ok({ pages: [] }));
    expect(stale.status).toBe(200);
    const bare = await guard(request("GET"), async () => ok({ pages: [] }));
    expect(await bare.json()).not.toHaveProperty("warnings");
  });

  it("leaves a failed write's body alone", async () => {
    const response = await guard(request("PUT"), async () => ({ status: 422, body: { error: "x", code: "invalid_spec" } }));
    expect(await response.json()).not.toHaveProperty("warnings");
  });
});

describe("redactError", () => {
  it("keeps three fields and drops everything else on the object", () => {
    const error = Object.assign(new Error("connection terminated"), {
      code: "57P01",
      // Driver-attached fields that can carry credentials must never be projected.
      query: "select * from pages where id = $1",
      parameters: ["6c0f2a5e-2c62-4c93-9f04-1d5b7a0e3311"],
      connectionString: "postgres://strata:hunter2@ep-x.neon.tech/main",
    });

    expect(redactError(error)).toEqual({
      name: "Error",
      code: "57P01",
      message: "connection terminated",
    });
  });

  it("redacts a connection string out of the message", () => {
    const error = new Error(
      'failed to connect to postgres://strata:hunter2@ep-cool-a1.us-west-2.aws.neon.tech/main?sslmode=require after 3 tries',
    );
    const projection = redactError(error);
    expect(projection.message).not.toContain("hunter2");
    expect(projection.message).toBe(
      "failed to connect to postgres://[redacted] after 3 tries",
    );
  });

  it("redacts every occurrence, and the postgresql:// spelling too", () => {
    expect(
      redact("primary postgresql://a:b@one/db fell back to postgres://c:d@two/db"),
    ).toBe("primary postgres://[redacted] fell back to postgres://[redacted]");
  });

  it("stops the URL at a quote or a space, so surrounding text survives", () => {
    expect(redact('url="postgres://u:p@host/db" retrying')).toBe(
      'url="postgres://[redacted]" retrying',
    );
  });

  it("survives a thrown value that is not an Error", () => {
    expect(redactError("postgres://u:p@host/db is down")).toEqual({
      name: "string",
      code: "",
      message: "postgres://[redacted] is down",
    });
    expect(redactError(undefined)).toEqual({
      name: "undefined",
      code: "",
      message: "undefined",
    });
    expect(redactError(null)).toEqual({ name: "object", code: "", message: "null" });
  });
});
