/** Named membership, lifecycle, and the sharing boundary. */
import { jsonBody, responses, schemaRef, spaceId } from "@/server/api/discovery/openapi/shared";

export const SPACE_PATHS: Record<string, unknown> = {
  "/v1/spaces": {
    get: {
      operationId: "list_spaces",
      tags: ["spaces"],
      summary: "List optional grouped inventory with page and sharing counts",
      responses: responses({ description: "Every space with page and sharing counts", schema: schemaRef("SpaceListResult") }),
    },
    post: {
      operationId: "create_space",
      tags: ["spaces"],
      summary: "Create a named membership and lifecycle boundary",
      requestBody: jsonBody(schemaRef("SpaceCreateRequest")),
      responses: responses({ description: "The new space, with its bundle URL when shared:true was passed", schema: schemaRef("SpaceResult"), created: true }, { body: true, quota: true, conflict: "A space with that slug already exists" }),
    },
  },
  "/v1/spaces/{id}": {
    patch: {
      operationId: "set_space",
      tags: ["spaces"],
      summary: "Rename a Space, or share its current Pages and return its stable link",
      parameters: [spaceId],
      requestBody: jsonBody(schemaRef("SpacePatchRequest")),
      responses: responses({ description: "The Space after the change. A repeated share returns the same space_url without adding later Pages", schema: schemaRef("SpaceResult") }, { body: true, path: true }),
    },
    delete: {
      operationId: "delete_space",
      tags: ["spaces"],
      summary: "Permanently delete an empty space or explicitly erase its pages",
      parameters: [spaceId, {
        name: "with_pages",
        in: "query",
        schema: { type: "boolean", default: false },
      }],
      responses: responses({ description: "The space is gone", schema: schemaRef("SpaceDeleteResult") }, { path: true, unprocessable: true, conflict: "The space still holds pages and with_pages was not set" }),
    },
  },
};
