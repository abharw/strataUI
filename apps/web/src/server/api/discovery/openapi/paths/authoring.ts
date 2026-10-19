/** The compact write contract and the component schemas behind it. */
import { responses, schemaRef } from "@/server/api/discovery/openapi/shared";

export const AUTHORING_PATHS: Record<string, unknown> = {
  "/v1/manifest": {
    get: {
      operationId: "get_manifest",
      tags: ["authoring"],
      summary: "Get selected JSON Render component schemas, or the full catalog",
      description:
        "Request only the component names the authoring guide made you select. The required root section is included automatically. Omit components only when the representation is genuinely uncertain.",
      parameters: [{
        name: "components",
        in: "query",
        required: false,
        description: "Comma-separated closed component names, for example chart,table,metric. Unknown or empty names are refused.",
        schema: { type: "string" },
      }],
      responses: responses(
        { description: "The selected live component schemas, with section included automatically", schema: { type: "object", description: "The same document served at /v1/manifest; component props are declared there rather than duplicated here." } },
        { unprocessable: true },
      ),
    },
  },
  "/v1/guide": {
    get: {
      operationId: "get_guide",
      tags: ["authoring"],
      summary: "Get model-facing authoring and composition doctrine",
      parameters: [{
        name: "topic",
        in: "query",
        description: "Omit it and you get `authoring`, the compact page contract every document tells you to read before writing.",
        schema: {
          type: "string",
          default: "authoring",
          enum: ["authoring", "representation", "render-policy", "vocabulary", "examples", "quality"],
        },
      }],
      responses: responses({ description: "One guide topic as plain text", schema: schemaRef("GuideResult") }, { unprocessable: true }),
    },
  },
};
