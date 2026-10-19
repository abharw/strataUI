import { describe, expect, it } from "vitest";

import { assertScratchDatabase } from "./require-scratch-db";

describe("refusing to test against a real database", () => {
  it("allows a local postgres", () => {
    expect(() => assertScratchDatabase("postgresql://postgres:x@localhost:5432/strata_test")).not.toThrow();
  });

  it("allows a hosted database named for the job", () => {
    expect(() => assertScratchDatabase("postgresql://u:p@ep-cool-cloud.neon.tech/strata_test?sslmode=require")).not.toThrow();
  });

  it("refuses a hosted database that is not", () => {
    expect(() => assertScratchDatabase("postgresql://u:p@ep-cool-cloud.neon.tech/neondb?sslmode=require")).toThrow(/refuse to run/);
  });

  it("says nothing when there is no database to protect", () => {
    expect(() => assertScratchDatabase(undefined)).not.toThrow();
  });
});
