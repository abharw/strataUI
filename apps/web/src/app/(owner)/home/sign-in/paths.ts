// Sign-in URLs, shared by the actions and the page so both use the same query shape.
// The code never appears in a URL.
interface SignInQuery {
  email?: string | null;
  /** Already validated. */
  next?: string | null;
}

export function signInPath(query: SignInQuery = {}): string {
  return withQuery("/home/sign-in", query, null);
}

export function signInCodePath(query: SignInQuery & { email: string }): string {
  return withQuery("/home/sign-in", query, "code");
}

function withQuery(base: string, query: SignInQuery, stage: string | null): string {
  const search = new URLSearchParams();
  if (stage !== null) search.set("stage", stage);
  if (query.email !== null && query.email !== undefined && query.email !== "") {
    search.set("email", query.email);
  }
  if (query.next !== null && query.next !== undefined && query.next !== "") {
    search.set("next", query.next);
  }
  const rendered = search.toString();
  return rendered === "" ? base : `${base}?${rendered}`;
}
