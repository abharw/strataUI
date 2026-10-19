import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { isStrataApp } from "@/server/api/http/request-app";

import RootLayout, { SHELL_MARK_SCRIPT } from "./layout";

const APP_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) StrataMobile/1.4";
const BROWSER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";

/** Runs the inline script against a stand-in root element and window listeners. */
function runShellMark(userAgent: string) {
  const attributes = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
  const listen = (type: string, listener: () => void) => {
    listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
  };
  const unlisten = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
  runInNewContext(SHELL_MARK_SCRIPT, {
    navigator: { userAgent },
    document: { documentElement: root },
    addEventListener: listen,
    removeEventListener: unlisten,
  });
  return {
    shell: () => attributes.get("data-strata-shell"),
    fire: (type: string) => {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
  };
}

describe("the native shell mark", () => {
  it("recognises the shell by the same token the server reads", () => {
    for (const userAgent of [APP_AGENT, BROWSER_AGENT]) {
      const server = isStrataApp(new Headers({ "user-agent": userAgent }));
      expect(runShellMark(userAgent).shell() === "native", userAgent).toBe(server);
    }
  });

  it("marks the root in the app and leaves a browser unmarked", () => {
    expect(runShellMark(APP_AGENT).shell()).toBe("native");

    const browser = runShellMark(BROWSER_AGENT);
    expect(browser.shell()).toBeUndefined();
    expect(browser.listening()).toBe(0);
  });

  it.each(["keydown", "pointerdown"])("unmarks the root on the first %s and stops listening", (type) => {
    const page = runShellMark(APP_AGENT);
    page.fire(type);

    expect(page.shell()).toBeUndefined();
    expect(page.listening()).toBe(0);
  });

  it("runs inline in <head>, before anything in the body can take focus", () => {
    const html = renderToStaticMarkup(
      RootLayout({ params: Promise.resolve({}), children: createElement("main") }),
    );
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));

    expect(head).toContain(`<script>${SHELL_MARK_SCRIPT}</script>`);
    expect(html.indexOf("<body")).toBeGreaterThan(html.indexOf("</head>"));
  });

  it("is the only condition under which the skip link stays hidden on focus", () => {
    const css = readFileSync(resolve(__dirname, "./globals.css"), "utf8");
    expect(css).toContain(':root[data-strata-shell="native"] .strata-skip-link:focus-visible');
    expect(css).not.toMatch(/@media[^{]*pointer[^{]*\{[^}]*strata-skip-link/u);
  });
});
