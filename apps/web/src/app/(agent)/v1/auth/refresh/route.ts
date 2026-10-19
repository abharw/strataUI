/**
 * Rotates a refresh token; the token in the body is the credential. Replaying a superseded
 * token revokes the whole grant and returns the same `invalid_grant` as an expired one.
 */
import * as credentials from "@/server/credentials/handlers";
import { onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

export async function POST(request: Request): Promise<Response> {
  return guard(request, async () => {
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;

    const input = parseBody(credentials.RefreshTokenBodySchema, body.value, ["refresh_token"]);
    if ("status" in input) return input;

    return credentials.refresh({ refresh_token: input.refresh_token });
  });
}
