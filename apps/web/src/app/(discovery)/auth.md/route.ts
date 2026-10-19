import { authMarkdown } from "@/server/api/discovery/auth-md";
import { discoveryResponse } from "@/server/api/discovery/response";
import { baseUrl } from "@/server/api/http/origin";

export const dynamic = "force-dynamic";

/** Connection guide for agents without a credential. Contains no credentials or user data. */
export function GET(request: Request): Response {
  return discoveryResponse(request, authMarkdown(baseUrl(request)), {
    contentType: "text/markdown; charset=utf-8",
  });
}
