"use client";

import dynamic from "next/dynamic";

import type { StrataSpec } from "@/page-content/schema";

export interface DevtoolsFrame {
  id: string;
  title: string;
  spec: StrataSpec;
}

// Production builds fold this branch away, keeping the devtools devDependency and the catalog
// out of the deployed bundle.
const DevtoolsPanel = process.env.NODE_ENV === "production"
  ? null
  : dynamic(() => import("./devtools-panel"), { ssr: false });

export function FixtureDevtools({ frames }: { frames: DevtoolsFrame[] }) {
  if (DevtoolsPanel === null) return null;
  return <DevtoolsPanel frames={frames} />;
}
