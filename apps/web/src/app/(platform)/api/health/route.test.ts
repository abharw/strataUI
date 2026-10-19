// The unauthenticated route must not hit the database per request or fingerprint the deployment.
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", () => ({ getDb: () => ({ execute }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  execute.mockResolvedValue({ rows: [] });
});

/** Fresh module per case, since the probe memo is module state. */
async function health(): Promise<typeof import("./route")> {
  return import("./route");
}

describe("GET /api/health", () => {
  it("answers once from the database and then from memory", async () => {
    const { GET } = await health();

    const first = await GET();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, db: "ok" });
    expect(execute).toHaveBeenCalledTimes(1);

    for (let n = 0; n < 20; n += 1) await GET();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("says nothing that fingerprints the deployment", async () => {
    const { GET } = await health();
    const body = await (await GET()).json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["db", "ok"]);
    expect(body).not.toHaveProperty("registry_version");
  });

  it("answers 503 without leaking the driver's error text", async () => {
    const { GET } = await health();
    execute.mockRejectedValue(new Error("postgres://user:hunter2@db.neon.tech/strata"));

    const response = await GET();
    expect(response.status).toBe(503);
    const raw = JSON.stringify(await response.json());
    expect(raw).not.toContain("hunter2");
    expect(JSON.parse(raw)).toEqual({ ok: false, db: "error" });
  });

  it("keeps itself out of every index and every cache", async () => {
    const { GET } = await health();
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });
});
