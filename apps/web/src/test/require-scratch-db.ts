/**
 * Integration suites create and delete rows, so refuse any DATABASE_URL that is not local or
 * named `*_test` before the first connection.
 */
const SCRATCH_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

export function assertScratchDatabase(raw: string | undefined): void {
  if (raw === undefined || raw.trim() === "") return;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a URL, so these tests cannot tell whether it is a scratch database.");
  }
  const database = url.pathname.replace(/^\//, "");
  if (SCRATCH_HOSTS.has(url.hostname) || database.endsWith("_test")) return;
  throw new Error(
    `These tests write and delete rows, so they refuse to run against ${url.hostname}/${database}. `
    + "Point DATABASE_URL at a local postgres or at a database whose name ends in _test.",
  );
}

assertScratchDatabase(process.env.DATABASE_URL);

// Page URLs are sealed at rest; tests use a fixed throwaway key. The real key is never in the repo.
if (process.env.STRATA_URL_KEY === undefined || process.env.STRATA_URL_KEY === "") {
  process.env.STRATA_URL_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
}

// Anonymous rate limits hash the request source with a key and refuse to run without one.
if (process.env.STRATA_SOURCE_HASH_KEY === undefined || process.env.STRATA_SOURCE_HASH_KEY === "") {
  process.env.STRATA_SOURCE_HASH_KEY = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
}
