import { afterEach, describe, expect, it, vi } from "vitest";

import { isProductionDeployment } from "./access";

// `.env.test.local` sets `VERCEL_ENV`, so fallback cases clear it explicitly.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isProductionDeployment", () => {
  it("takes the platform's answer whenever there is one", () => {
    expect(isProductionDeployment("production")).toBe(true);
    expect(isProductionDeployment("preview")).toBe(false);
    expect(isProductionDeployment("development")).toBe(false);
  });

  it("falls back to the build's own NODE_ENV where VERCEL_ENV does not exist", () => {
    vi.stubEnv("VERCEL_ENV", undefined);

    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionDeployment()).toBe(true);
    expect(isProductionDeployment("")).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(isProductionDeployment()).toBe(false);
    expect(isProductionDeployment("")).toBe(false);
  });
});
