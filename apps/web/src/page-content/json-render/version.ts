/**
 * The installed @json-render versions, read from package.json. It sits above `src`, so the `@/`
 * alias cannot reach it, hence the relative import below.
 */
// oxlint-disable-next-line no-restricted-imports -- see file doc comment above.
import packageJson from "../../../package.json";

const pin = (name: string): string => {
  const version = (packageJson.dependencies as Record<string, string>)[name];
  if (version === undefined) throw new Error(`${name} is not a dependency`);
  return version.replace(/^[\^~]/, "");
};

export const JSON_RENDER_VERSION = pin("@json-render/core");
export const JSON_RENDER_DIRECTIVES_VERSION = pin("@json-render/directives");
