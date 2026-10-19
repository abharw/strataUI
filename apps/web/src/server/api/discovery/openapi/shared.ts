/** Shared building blocks for OpenAPI operations, so failure sets are defined once. */
export const JSON_MEDIA = "application/json";

/** /v1 is opened by the sw_/sv_ credentials a grant was issued. */
export const apiSecurity = [{ strataCredential: [] }];
export const pairSecurity = [{ strataCredential: ["namespace:pair"] }];

export const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const jsonBody = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: { [JSON_MEDIA]: { schema } },
});

export const errorBody = (description: string) => ({
  description,
  content: { [JSON_MEDIA]: { schema: schemaRef("ApiError") } },
});

export const authenticationErrorBody = (description: string) => ({
  ...errorBody(description),
  headers: {
    "WWW-Authenticate": {
      description:
        "The bearer challenge for this resource. Read /auth.md, then connect with the person's email address.",
      schema: { type: "string" },
      example: 'Bearer realm="strata"',
    },
  },
});

export const okBody = (description: string, schema: Record<string, unknown>) => ({
  description,
  content: { [JSON_MEDIA]: { schema } },
});

/** 403: valid credential, not permitted (viewer on a mutating route, or missing scope). */
const scopeErrorBody = {
  description:
    "The credential is valid but not permitted: a viewer (sv_) credential on a mutating route, or a grant without the required scope. Viewer credentials are read-only for the life of the grant; no refresh widens them.",
  headers: {
    "WWW-Authenticate": {
      description: "Names the scope the route required.",
      schema: { type: "string" },
      example: 'Bearer realm="strata", error="insufficient_scope", scope="pages:write"',
    },
  },
  content: { [JSON_MEDIA]: { schema: schemaRef("InsufficientScopeError") } },
};

/**
 * The response set for one operation, matching what handlers return: 400 only for unparseable
 * bodies, 422 for validation failures, and the real success schema.
 */
export function responses(
  success: { description: string; schema: Record<string, unknown>; created?: boolean; replay?: string },
  outcomes: {
    /** Takes a request body, which can be unparseable, oversized, or invalid. */
    body?: boolean;
    /** Names a page or space in its path. */
    path?: boolean;
    /** Lifecycle or version state can refuse the operation. */
    conflict?: string;
    /** The operation can create, and so can hit a namespace quota. */
    quota?: boolean;
    /** Never returns an authentication failure. */
    public?: boolean;
    /** Query or path input can be refused. */
    unprocessable?: boolean;
    /** Can refuse a file for its own size, not the body's. */
    tooLarge?: string;
    /** Addresses something whose window can close. */
    gone?: string;
  } = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  result[success.created === true ? "201" : "200"] = okBody(success.description, success.schema);
  if (success.replay !== undefined) result["200"] = okBody(success.replay, success.schema);
  if (outcomes.body === true) {
    result["400"] = errorBody("Body is not parseable JSON, or is not an object. A body that parses but fails validation is 422.");
  }
  if (outcomes.public !== true) {
    result["401"] = authenticationErrorBody("The bearer credential is missing where required, invalid, expired, or revoked. An sw_/sv_ access token that merely expired is recoverable with POST /v1/auth/refresh. Read keys (pgk_, spk_) are browser capabilities and never API credentials");
    result["403"] = scopeErrorBody;
  }
  if (outcomes.path === true) {
    result["404"] = errorBody("No page or space with that id in this namespace");
  }
  if (outcomes.conflict !== undefined) {
    result["409"] = errorBody(outcomes.conflict);
  }
  if (outcomes.tooLarge !== undefined) {
    result["413"] = errorBody(outcomes.tooLarge);
  } else if (outcomes.body === true) {
    result["413"] = errorBody("Body over 256 KB");
  }
  if (outcomes.gone !== undefined) {
    result["410"] = errorBody(outcomes.gone);
  }
  if (outcomes.body === true || outcomes.unprocessable === true) {
    result["422"] = errorBody("The request parsed but is not valid: a failing field is named in `path`, and `next` says what to call instead");
  }
  if (outcomes.quota === true) {
    result["429"] = errorBody("A namespace quota or signup rate limit is exhausted; `resource` and `limit` say which");
  }
  result.default = errorBody("Actionable error");
  return result;
}

export const pageId = {
  name: "id",
  in: "path",
  required: true,
  description: "Opaque page UUID",
  schema: { type: "string", format: "uuid" },
};
export const spaceId = {
  name: "id",
  in: "path",
  required: true,
  description: "Opaque space UUID",
  schema: { type: "string", format: "uuid" },
};
export const rateLimitBody = (description: string) => ({
  description,
  headers: {
    "Retry-After": {
      description: "Seconds until this caller may try again",
      schema: { type: "integer", minimum: 1 },
    },
  },
  content: { [JSON_MEDIA]: { schema: schemaRef("ApiError") } },
});
