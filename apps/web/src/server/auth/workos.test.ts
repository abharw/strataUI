/**
 * Every provider failure is translated and none escapes. Fixtures use the SDK's own exception
 * classes so the structural reader is tested against real shapes.
 */
import { describe, expect, it } from "vitest";
import {
  AuthenticationException,
  BadRequestException,
  GenericServerException,
  RateLimitExceededException,
} from "@workos-inc/node";

import { MagicAuthError, translateMagicAuthError, workosErrorCode } from "./workos";

const REQUEST_ID = "req_01HZZ";

function badRequest(code: string): BadRequestException {
  return new BadRequestException({ code, message: code, requestID: REQUEST_ID });
}

describe("translating a WorkOS failure", () => {
  it("gives wrong, expired and already-spent codes one answer", () => {
    // A wrong guess and a replay produce these two codes; they must be indistinguishable.
    for (const code of ["invalid_one_time_code", "one_time_code_previously_used"]) {
      expect(translateMagicAuthError(badRequest(code), "verify").code).toBe("invalid_code");
    }
  });

  it("names an undeliverable address rather than pretending a code was sent", () => {
    const translated = translateMagicAuthError(
      badRequest("email_domain_not_deliverable"),
      "start",
    );
    expect(translated.code).toBe("undeliverable_email");
  });

  it("reads the code out of an authentication exception's rawData", () => {
    const error = new AuthenticationException(
      403,
      { code: "email_verification_required" },
      REQUEST_ID,
    );
    expect(workosErrorCode(error)).toBe("email_verification_required");
    expect(translateMagicAuthError(error, "verify").code).toBe("invalid_code");
  });

  it("carries the provider's own retry window through a 429", () => {
    const error = new RateLimitExceededException("slow down", REQUEST_ID, 42);
    const translated = translateMagicAuthError(error, "start");
    expect(translated.code).toBe("rate_limited");
    expect(translated.retryAfterSeconds).toBe(42);
  });

  it("answers an unrecognised 400 differently on each surface", () => {
    const unknown = badRequest("something_new_they_shipped");
    // On verify a 400 is nearly always the code; a 500 would invite retries.
    expect(translateMagicAuthError(unknown, "verify").code).toBe("invalid_code");
    // On start there is no code to be wrong, so it is a fault.
    expect(translateMagicAuthError(unknown, "start").code).toBe("unavailable");
  });

  it("treats a server fault and a transport failure alike", () => {
    const server = new GenericServerException(502, "bad gateway", {}, REQUEST_ID);
    expect(translateMagicAuthError(server, "verify").code).toBe("unavailable");
    expect(translateMagicAuthError(new TypeError("fetch failed"), "start").code)
      .toBe("unavailable");
    expect(translateMagicAuthError(undefined, "start").code).toBe("unavailable");
  });

  it("returns a MagicAuthError and never the provider's own object", () => {
    const original = badRequest("invalid_one_time_code");
    const translated = translateMagicAuthError(original, "verify");
    expect(translated).toBeInstanceOf(MagicAuthError);
    expect(translated).not.toBe(original);
    // Not chained: `cause` would carry the provider's request context into logs.
    expect(translated.cause).toBeUndefined();
    expect(translated.message).toBe("invalid_code");
  });
});
