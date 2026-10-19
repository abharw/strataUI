/**
 * Exchanges the emailed code for a credential. Unauthenticated: the code is the authorization.
 * Returns the standard credential body plus `namespace_display_name`.
 */
import * as auth from "@/server/auth/handlers";
import { onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";
import { workosMagicAuth, type MagicAuth } from "@/server/auth/workos";
import {
  requestSource,
  requestSourcePseudonym,
  requestUserAgent,
} from "@/server/api/http/request-source";

interface RouteDependencies {
  verify: typeof auth.verify;
  magic: () => MagicAuth;
}

const defaults: RouteDependencies = { verify: auth.verify, magic: workosMagicAuth };

/** Injectable HTTP seam; production exports the standard Next.js `POST`. */
export function authVerifyPost(
  dependencies: Partial<RouteDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaults, ...dependencies };
  return (request) => guard(request, async () => {
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;

    const input = parseBody(auth.AuthVerifyBodySchema, body.value, ["verify_auth"]);
    if ("status" in input) return input;

    return deps.verify({
      email: input.email,
      code: input.code,
      driver: input.driver,
      label: input.label,
      mode: input.mode,
      display_name: input.display_name,
      person_name: input.person_name,
      source_hash: authVerifySourceHash(request),
      ipAddress: requestSource(request),
      userAgent: requestUserAgent(request),
    }, deps.magic());
  });
}

const post = authVerifyPost();

export async function POST(request: Request): Promise<Response> {
  return post(request);
}

/** Stable keyed bucket for the rolling per-source wrong-code window. */
export function authVerifySourceHash(request: Request): string {
  return requestSourcePseudonym(request, "auth-verify");
}
