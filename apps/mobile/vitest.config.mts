import { defineConfig } from "vitest/config";

export default defineConfig({
  // `__DEV__` is injected by Metro, not by Node, so a module that reads it at
  // import time is otherwise unimportable here. A test bundle is a shipped
  // bundle: false is the value that matters.
  define: { __DEV__: "false" },
});
