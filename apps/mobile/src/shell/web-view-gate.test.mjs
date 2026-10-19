import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  Linking: {
    canOpenURL: vi.fn(),
    openURL: vi.fn(),
  },
}));

import { decideHomeNavigation } from "../home/home-navigation";
import { SHELL_ORIGIN_WHITELIST, shouldStartNavigation } from "./navigation";

/**
 * Execute the installed CommonJS gate with a mocked OS handler. Importing it
 * directly makes Vitest evaluate React Native's Flow runtime entry point.
 */
function installedGate() {
  const resolve = createRequire(import.meta.url);
  const path = resolve.resolve("react-native-webview/lib/WebViewShared");
  const packageRequire = createRequire(path);
  const module = { exports: {} };
  new Function("require", "exports", "module", readFileSync(path, "utf8"))(
    (specifier) => {
      if (specifier === "react-native") return native;
      if (specifier === "./WebView.styles") return { default: {} };
      return packageRequire(specifier);
    },
    module.exports,
    module,
  );
  const gate = module.exports.createOnShouldStartLoadWithRequest;
  if (gate === undefined) throw new Error("Installed WebView gate was not exported");
  return gate;
}

describe("Strata's WebView library gate", () => {
  it("sends an arbitrary unsupported scheme through Strata's block policy without opening it", () => {
    const loadRequest = vi.fn();
    const openOutside = vi.fn();
    const candidate = "strata-test-scheme://example";
    const onShouldStart = installedGate()(
      loadRequest,
      SHELL_ORIGIN_WHITELIST,
      (request) => shouldStartNavigation(
        request.url,
        (url) => decideHomeNavigation("https://strata.test", url),
        openOutside,
      ),
    );

    onShouldStart({ nativeEvent: { url: candidate, lockIdentifier: 4 } });

    expect(loadRequest).toHaveBeenCalledWith(false, candidate, 4);
    expect(openOutside).not.toHaveBeenCalled();
    expect(native.Linking.canOpenURL).not.toHaveBeenCalled();
    expect(native.Linking.openURL).not.toHaveBeenCalled();
  });
});
