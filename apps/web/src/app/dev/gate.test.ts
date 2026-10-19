import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * NODE_ENV is "test" here, so the gates are checked by source shape. The build gate must stay a
 * module-level literal comparison with a dynamic import, or the bundler cannot drop the preview.
 */
const GATED_ROUTES = ["fixtures", "home", "system"] as const;

describe("the /dev route gate", () => {
  for (const route of GATED_ROUTES) {
    it(`keeps /dev/${route} out of a production compile`, () => {
      const source = readFileSync(new URL(`./${route}/page.tsx`, import.meta.url), "utf8");
      const lines = source.split("\n");

      const gate = lines.find((line) => line.startsWith("const load"));
      expect(gate).toContain('process.env.NODE_ENV === "production"');

      const dynamicImport = source.match(/\(\) => import\("([^"]+)"\)/);
      expect(dynamicImport).not.toBeNull();

      const previewModule = dynamicImport?.[1];
      const staticallyImported = lines.some((line) => line.startsWith(`import `)
        && line.endsWith(`from "${previewModule}";`));
      expect(staticallyImported).toBe(false);
    });

    it(`refuses /dev/${route} on a production host`, () => {
      const source = readFileSync(new URL(`./${route}/page.tsx`, import.meta.url), "utf8");

      expect(source).toContain("isProductionDeployment()");
      expect(source).toContain("notFound()");
    });
  }
});
