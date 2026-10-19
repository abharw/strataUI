/**
 * Unauthenticated: emails the person a sign-in code. The response is identical whether or not
 * the address already has a Strata.
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
  start: typeof auth.start;
  magic: () => MagicAuth;
}

const defaults: RouteDependencies = { start: auth.start, magic: workosMagicAuth };

/** Injectable HTTP seam; production exports the standard Next.js `POST`. */
export function authStartPost(
  dependencies: Partial<RouteDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaults, ...dependencies };
  return (request) => guard(request, async () => {
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;

    const input = parseBody(auth.AuthStartBodySchema, body.value, ["start_auth"]);
    if ("status" in input) return input;

    return deps.start({
      email: input.email,
      driver: input.driver,
      label: input.label,
      source_hash: authStartSourceHash(request),
      ipAddress: requestSource(request),
      userAgent: requestUserAgent(request),
    }, deps.magic());
  });
}

const post = authStartPost();

export async function POST(request: Request): Promise<Response> {
  return post(request);
}

/** Stable keyed bucket for the rolling per-source code-request window. */
export function authStartSourceHash(request: Request): string {
  return requestSourcePseudonym(request, "auth-start");
}
