/**
 * The model-facing JSON Render catalog. Every definition is local, so an agent cannot choose
 * arbitrary CSS, HTML, dialogs, overlays or form controls.
 */
import { defineCatalog } from "@json-render/core";

import { COMPONENT_NAMES, registry as strataDefinitions, type ComponentName } from "@/page-content/catalog";
import { strataDisplaySchema } from "@/page-content/authoring/prompt";

/**
 * Props and slots define the grammar; description and interaction feed the prompt and manifest.
 * The return type is explicit because inference widens props to the union of every schema.
 */
function custom<Name extends ComponentName>(name: Name): {
  props: (typeof strataDefinitions)[Name]["schema"];
  description: (typeof strataDefinitions)[Name]["meta"]["description"];
  interaction: (typeof strataDefinitions)[Name]["meta"]["interaction"];
  shape: (typeof strataDefinitions)[Name]["meta"]["shape"];
  readerActs: (typeof strataDefinitions)[Name]["meta"]["readerActs"];
} {
  const definition = strataDefinitions[name];
  return {
    props: definition.schema,
    description: definition.meta.description,
    interaction: definition.meta.interaction,
    shape: definition.meta.shape,
    readerActs: definition.meta.readerActs,
  };
}

/** The four containers a page composes with. Everything else is a leaf. */
const SLOTTED = new Set<ComponentName>(["card", "carousel", "grid", "section"]);

type CatalogComponents = {
  [Name in ComponentName]: ReturnType<typeof custom<Name>> & { slots?: string[] };
};

/** Mapped from `COMPONENT_NAMES` (sorted) so membership has one declaration and order is stable. */
const components = Object.fromEntries(
  COMPONENT_NAMES.map((name) => [
    name,
    SLOTTED.has(name) ? { ...custom(name), slots: ["default"] } : custom(name),
  ]),
) as CatalogComponents;

export const strataCatalog = defineCatalog(strataDisplaySchema, {
  components,
  actions: {},
});
