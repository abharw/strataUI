import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const usesSharedDatabase = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Many tests are integration tests against the database in `DATABASE_URL`, a dozen round trips
 * each, so the timeout is 30 s rather than 5 s. setupFiles refuses any database that is not
 * local or named `*_test`; `pnpm test` loads `.env.test.local` without overriding CI's value.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      // `server-only` throws on import outside Next's server build; tests run in node.
      "server-only": path.join(root, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    setupFiles: [path.join(root, "src/test/require-scratch-db.ts")],
    // Integration files share one database with global quota accounting, so run them serially.
    fileParallelism: !usesSharedDatabase,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
