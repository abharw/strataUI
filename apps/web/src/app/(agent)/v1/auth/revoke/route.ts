/**
 * An agent revokes its own grant, via the `Authorization` header or `{ token }` in the body
 * (for a refresh token). Always 200, including for unknown tokens.
 */
import * as credentials from "@/server/credentials/handlers";
import { bearer } from "@/server/api/http/auth";
import { onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

export async function POST(request: Request): Promise<Response> {
  return guard(request, async () => {
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;

    const input = parseBody(credentials.RevokeTokenBodySchema, body.value, ["revoke_token"]);
    if ("status" in input) return input;

    return credentials.revoke({ token: input.token ?? bearer(request) });
  });
}
