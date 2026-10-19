/** A parsed JSON body, indexable to any depth, so route tests avoid `Response.json()`'s `any`. */
export type JsonBody = { readonly [key: string]: JsonBody };

/** `response.json()`, without the `any`. */
export async function jsonBody(response: Response): Promise<JsonBody> {
  return (await response.json()) as JsonBody;
}
