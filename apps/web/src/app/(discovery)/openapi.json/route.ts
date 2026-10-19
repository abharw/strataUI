import { openApi } from "@/server/api/discovery/openapi";
import { discoveryResponse } from "@/server/api/discovery/response";
import { baseUrl } from "@/server/api/http/origin";

export const dynamic = "force-dynamic";

/**
 * Built per request origin, so `Vary` on the host keeps shared caches from serving one
 * hostname's document to another (e.g. sending production credentials to a preview).
 */
export function GET(request: Request): Response {
  return discoveryResponse(request, JSON.stringify(openApi(baseUrl(request))), {
    contentType: "application/json",
    vary: "Host, X-Forwarded-Host",
  });
}
