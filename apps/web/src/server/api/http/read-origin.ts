/**
 * `baseUrl` for server components, which get params rather than a `Request`. Same policy as the API
 * edge (preview alias, `PUBLIC_BASE_URL`, then request host), so rendered and API links agree.
 */
import { headers } from "next/headers";

import { configuredOrigin, originFrom } from "./origin";

export async function readOrigin(): Promise<string> {
  try {
    return originFrom(await headers(), null);
  } catch {
    // Outside a request scope (tests, scripts): use configuration, or a relative link.
    return configuredOrigin() ?? "";
  }
}
