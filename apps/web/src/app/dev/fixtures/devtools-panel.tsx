"use client";

import { useId, useState } from "react";
import { JsonRenderDevtools } from "@json-render/devtools-react";
import { JSONUIProvider } from "@json-render/react";

import { strataCatalog } from "@/page-content/json-render/catalog";
import { strataReactRegistry } from "@/page-content/json-render/registry";

import type { DevtoolsFrame } from "./devtools";

/** Upstream compares `initialState` by identity inside an effect. */
const EMPTY_STATE = Object.freeze({});

/**
 * The panel reads a state store, so it needs a provider; each `PageFrame` opens its own, so the
 * panel gets a separate one and its State tab shows an empty store. Loaded only via `./devtools`.
 */
export default function DevtoolsPanel({ frames }: { frames: DevtoolsFrame[] }) {
  const selectId = useId();
  const [selected, setSelected] = useState(frames[0]?.id);
  const spec = frames.find((frame) => frame.id === selected)?.spec ?? null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={selectId} className="text-meta text-muted-foreground">
        Devtools spec
      </label>
      <select
        id={selectId}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="rounded-control border border-border bg-background px-2 py-1 text-meta"
      >
        {frames.map((frame) => (
          <option key={frame.id} value={frame.id}>
            {frame.title}
          </option>
        ))}
      </select>
      <JSONUIProvider registry={strataReactRegistry} initialState={EMPTY_STATE}>
        <JsonRenderDevtools spec={spec} catalog={strataCatalog} position="right" />
      </JSONUIProvider>
    </div>
  );
}
