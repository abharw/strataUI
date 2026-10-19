import { llmsText } from "@/server/api/discovery/llms";
import { discoveryResponse } from "@/server/api/discovery/response";
import { baseUrl } from "@/server/api/http/origin";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return discoveryResponse(request, llmsText(baseUrl(request)), {
    contentType: "text/markdown; charset=utf-8",
  });
}
