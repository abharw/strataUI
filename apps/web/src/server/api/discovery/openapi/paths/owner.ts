/**
 * Owner-only reads from the signed-in Home, authorized by the session cookie (`cookieAuth`) rather
 * than any agent credential. Owner mutations are Server Actions and have no paths.
 */
import { errorBody, okBody, schemaRef } from "@/server/api/discovery/openapi/shared";
import { MAX_OWNER_SEARCH_CHARS } from "@/shared/navigation/search";

/** The owner session cookie; only the browser holds one. */
const sessionSecurity = [{ cookieAuth: [] }];

export const OWNER_PATHS: Record<string, unknown> = {
  "/home/agents": {
    get: {
      operationId: "owner_list_agents",
      tags: ["owner"],
      summary: "List every agent connected to this Strata",
      description:
        "Called from the person's signed-in Home, not by an agent. Returns each grant with its label, driver, kind, mode, scope, creation and last-use times, and revocation state. No token is recoverable from this route.",
      security: sessionSecurity,
      responses: {
        "200": okBody("Every grant on this Strata, revoked ones included", schemaRef("OwnerAgentsResponse")),
        "404": errorBody("This session does not open a Strata; it may have been revoked"),
        default: errorBody("Actionable error"),
      },
    },
  },
  "/home/search": {
    get: {
      operationId: "owner_search_pages",
      tags: ["owner"],
      summary: "Find the person's own Pages by their body text",
      description:
        "Called from the person's signed-in Home while they type. It answers with Page ids and nothing else: Home already holds the bounded inventory those ids join against, so no document, snippet, or capability URL crosses this response. An empty or whitespace-only q matches nothing rather than everything.",
      security: sessionSecurity,
      parameters: [{
        name: "q",
        in: "query",
        required: false,
        description: `What the person typed, matched against the visible text of every Page in their Strata. Over ${String(MAX_OWNER_SEARCH_CHARS)} characters is refused rather than truncated.`,
        schema: { type: "string", maxLength: MAX_OWNER_SEARCH_CHARS },
      }],
      responses: {
        "200": okBody(
          "The ids of the Pages whose text matches, in inventory order",
          schemaRef("OwnerSearchResponse"),
        ),
        "400": okBody(
          `q is longer than ${String(MAX_OWNER_SEARCH_CHARS)} characters`,
          schemaRef("OwnerSearchRefusal"),
        ),
        "404": errorBody("This session does not open a Strata; it may have been revoked"),
        "500": okBody("The Page text could not be searched", schemaRef("OwnerSearchRefusal")),
        default: errorBody("Actionable error"),
      },
    },
  },
};
