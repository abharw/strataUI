/** The page surface: write, edit, read, and the consent log a page produces. */
import { jsonBody, pageId, responses, schemaRef } from "@/server/api/discovery/openapi/shared";

export const PAGE_PATHS: Record<string, unknown> = {
  "/v1/pages": {
    get: {
      operationId: "list_pages",
      tags: ["pages"],
      summary: "List the flat page inventory with space metadata",
      parameters: [
        { name: "space_id", in: "query", schema: { type: "string", format: "uuid" } },
      ],
      responses: responses({ description: "Flat page inventory with space metadata on every row", schema: schemaRef("PageListResult") }, { path: true }),
    },
    put: {
      operationId: "put_page",
      tags: ["pages"],
      summary: "Create one JSON Render page",
      description:
        "Creation only. Edit an existing page with PATCH /v1/pages/{id}/spec so untouched elements keep their addresses.",
      requestBody: jsonBody(schemaRef("PutPageRequest")),
      responses: responses({ description: "The new Page, its owner URL, recipient capability URL, and first version", schema: schemaRef("PageWriteResult"), created: true }, { body: true, quota: true, conflict: "That slug is taken in this Space" }),
    },
  },
  "/v1/pages/preflight": {
    post: {
      operationId: "preflight_page",
      tags: ["pages"],
      summary: "Run the authoring gate on a candidate spec without storing anything",
      description:
        "Checks the candidate spec schema, text budget, field and collection caps, and presentation guidance. Nothing is created or versioned. A final write also checks request metadata, permissions and current database state; a clean preflight does not guarantee that write succeeds.",
      requestBody: jsonBody(schemaRef("PreflightRequest")),
      responses: responses({ description: "The gate's verdict and telemetry for the candidate", schema: schemaRef("PreflightResult") }, { body: true }),
    },
  },
  "/v1/pages/{id}/spec": {
    patch: {
      operationId: "patch_page_spec",
      tags: ["pages"],
      summary: "Edit a page spec with RFC 6902 operations",
      description:
        "Read the page first, then send its base_version with operations addressing /answer, /root and /elements. Elements the operations do not name are untouched. A patch only changes content: it cannot rename or reclassify a page.",
      parameters: [pageId],
      requestBody: jsonBody(schemaRef("PatchSpecRequest")),
      responses: responses({ description: "The Page after the operations, at its new version", schema: schemaRef("PageWriteResult") }, { body: true, path: true, conflict: "base_version is stale" }),
    },
    put: {
      operationId: "rewrite_page_spec",
      tags: ["pages"],
      summary: "Replace a page spec wholesale",
      description:
        "For a rebuild, not an edit. A patch cannot address /elements, because an operation that swaps the element map silently deletes everything it does not mention; this route says out loud that it replaces the page. Still takes base_version.",
      parameters: [pageId],
      requestBody: jsonBody(schemaRef("RewriteSpecRequest")),
      responses: responses({ description: "The rebuilt Page at its new version", schema: schemaRef("PageWriteResult") }, { body: true, path: true, conflict: "base_version is stale" }),
    },
  },
  "/v1/pages/{id}": {
    get: {
      operationId: "get_page",
      tags: ["pages"],
      summary: "Read the current page spec, version, exposure, and provenance",
      parameters: [pageId],
      responses: responses({ description: "The stored spec with exposure and provenance", schema: schemaRef("PageDetailResult") }, { path: true }),
    },
    patch: {
      operationId: "set_page",
      tags: ["pages"],
      summary: "Rename, share, or move-and-reset-private a page",
      parameters: [pageId],
      requestBody: jsonBody(schemaRef("PagePatchRequest")),
      responses: responses({ description: "The Page after the change", schema: schemaRef("PageUpdateResult") }, { body: true, path: true, conflict: "The destination already has a Page with this slug" }),
    },
    delete: {
      operationId: "delete_page",
      tags: ["pages"],
      summary: "Permanently erase a page after explicit confirmation",
      parameters: [pageId, {
        name: "confirm",
        in: "query",
        schema: { type: "boolean", default: false },
      }],
      requestBody: jsonBody({
        type: "object",
        properties: { confirm: { type: "boolean" } },
        additionalProperties: false,
      }, false),
      responses: responses({ description: "The page is gone", schema: schemaRef("PageDeleteResult") }, { body: true, path: true }),
    },
  },
  "/v1/pages/{id}/summary": {
    get: {
      operationId: "get_page_summary",
      tags: ["pages"],
      summary: "Read a compact element outline without the full spec",
      parameters: [pageId],
      responses: responses({ description: "A compact outline instead of the full spec", schema: schemaRef("PageSummaryResult") }, { path: true }),
    },
  },
  "/v1/pages/{id}/find": {
    get: {
      operationId: "find_elements",
      tags: ["pages"],
      summary: "Find elements by component type or text",
      parameters: [
        pageId,
        { name: "component", in: "query", schema: { type: "string" } },
        { name: "text", in: "query", schema: { type: "string" } },
      ],
      responses: responses({ description: "Matching elements, capped and flagged when truncated", schema: schemaRef("FindResult") }, { path: true, unprocessable: true }),
    },
  },
  "/v1/decisions": {
    get: {
      operationId: "list_decisions",
      tags: ["pages"],
      summary: "Read the consent log: what was asked, what was chosen, and when",
      description:
        "Answers are kept apart from pages, so deleting a page does not erase the record that someone approved something. Rows for a deleted page carry page_deleted_at. Nothing prunes the log, so the reply is one page of it: read the next page by sending the previous reply's next_before back as before, and stop when next_before is null.",
      parameters: [
        { name: "page_id", in: "query", schema: { type: "string", format: "uuid" } },
        {
          name: "limit",
          in: "query",
          description: "Answers per page. Default 100.",
          schema: { type: "integer", minimum: 1, maximum: 500 },
        },
        {
          name: "before",
          in: "query",
          description: "An opaque next_before from an earlier page of this log. Anything else is refused rather than guessed at.",
          schema: { type: "string" },
        },
      ],
      responses: responses({ description: "One page of recorded answers, newest first", schema: schemaRef("DecisionLogResult") }, { unprocessable: true }),
    },
  },
};
