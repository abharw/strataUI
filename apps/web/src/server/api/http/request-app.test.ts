/**
 * `isStrataApp` decides whether Home addresses the Expo shell or a browser. The fixtures are the
 * two header shapes real callers pass.
 */
import { describe, expect, it } from "vitest";

import { isStrataApp } from "./request-app";

describe("isStrataApp", () => {
  it("is true for the Expo shell's user-agent, false for a browser's", () => {
    expect(isStrataApp(new Headers({ "user-agent": "Mozilla/5.0 StrataMobile/0.1" }))).toBe(true);
    expect(isStrataApp(new Headers({
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    }))).toBe(false);
    expect(isStrataApp(new Headers())).toBe(false);
  });

  it("reads a route handler's request headers, which are the same bag", () => {
    const request = new Request("https://example.com/", {
      headers: { "user-agent": "Mozilla/5.0 StrataMobile/0.1" },
    });
    expect(isStrataApp(request.headers)).toBe(true);
  });

  it("reads an object shaped like Next's headers() result", () => {
    // Next's ReadonlyHeaders has a plain `headers` bag without `.get` beside a working `.get()`.
    const nextHeaders = {
      headers: { "user-agent": "Mozilla/5.0 StrataMobile/0.1" },
      get(name: string): string | null {
        if (name.toLowerCase() === "user-agent") return "Mozilla/5.0 StrataMobile/0.1";
        return null;
      },
    };
    expect(isStrataApp(nextHeaders)).toBe(true);
  });
});
