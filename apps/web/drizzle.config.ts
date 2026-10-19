import { defineConfig } from "drizzle-kit";

// Migrations use the direct Neon connection: PgBouncer in transaction mode cannot carry the
// session state DDL needs. The getter is lazy so `drizzle-kit generate` works without env.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    get url() {
      const url = process.env.DATABASE_URL_UNPOOLED;
      if (!url) {
        throw new Error("DATABASE_URL_UNPOOLED is not set");
      }
      return url;
    },
  },
});
