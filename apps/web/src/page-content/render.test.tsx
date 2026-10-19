import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMPONENT_NAMES } from "./catalog";

const here = dirname(fileURLToPath(import.meta.url));

describe("generated page blocks", () => {
  it("ships an view.tsx for every catalog component", () => {
    for (const name of COMPONENT_NAMES) {
      const path = join(here, "blocks", name, "view.tsx");
      expect(existsSync(path), `missing ${name}/view.tsx`).toBe(true);
    }
  });
});
