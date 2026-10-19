"use client";

import dynamic from "next/dynamic";
import type { InferCatalogComponents, InferComponentProps } from "@json-render/core";
import type { ComponentRegistry, ComponentRenderer } from "@json-render/react";

import { Approval } from "@/page-content/blocks/approval/view";
import { Accordion } from "@/page-content/blocks/accordion/view";
import { Card } from "@/page-content/blocks/card/view";
import { Checklist } from "@/page-content/blocks/checklist/view";
import { CodeBlock } from "@/page-content/blocks/code-block/view";
import { Comparison } from "@/page-content/blocks/comparison/view";
import { Decision } from "@/page-content/blocks/decision/view";
import { Facts } from "@/page-content/blocks/facts/view";
import { Grid } from "@/page-content/blocks/grid/view";
import { ItemList } from "@/page-content/blocks/item-list/view";
import { LinkButton } from "@/page-content/blocks/link-button/view";
import { Metric } from "@/page-content/blocks/metric/view";
import { Phases } from "@/page-content/blocks/phases/view";
import { Progress } from "@/page-content/blocks/progress/view";
import { ReferenceList } from "@/page-content/blocks/reference-list/view";
import { Section } from "@/page-content/blocks/section/view";
import { Prose } from "@/page-content/blocks/prose/view";
import { Quote } from "@/page-content/blocks/quote/view";
import { Callout } from "@/page-content/blocks/callout/view";
import { StatusList } from "@/page-content/blocks/status-list/view";
import { StreakGrid } from "@/page-content/blocks/streak-grid/view";
import { Table } from "@/page-content/blocks/table/view";
import { Timeline } from "@/page-content/blocks/timeline/view";
import { BrokenBlock } from "@/page-content/broken-block";
import { BreakdownData } from "@/page-content/blocks/breakdown/breakdown-data";
import { ChartData } from "@/page-content/blocks/chart/chart-data";
// Type-only import, erased at build, so model-facing schemas and prompts stay off the client.
import type { strataCatalog } from "./catalog";

// Heavy third-party leaves (recharts, Base UI Drawer, embla) load only when a spec uses them.
// `chart` and `breakdown` skip SSR because recharts measures the client viewport.
const AttachmentList = dynamic(() =>
  import("@/page-content/blocks/attachment-list/view").then((module) => module.AttachmentList),
);
const Carousel = dynamic(() =>
  import("@/page-content/blocks/carousel/view").then((module) => module.Carousel),
);
const Chart = dynamic(
  () => import("@/page-content/blocks/chart/view").then((module) => module.Chart),
  { ssr: false },
);
const Breakdown = dynamic(
  () => import("@/page-content/blocks/breakdown/view").then((module) => module.Breakdown),
  { ssr: false },
);

type CatalogComponents = InferCatalogComponents<typeof strataCatalog>;

type StrataComponents = {
  [Name in keyof CatalogComponents]: ComponentRenderer<
    InferComponentProps<typeof strataCatalog, Name>
  >;
};

/**
 * JSON Render owns traversal; Strata supplies the registry and boundaries. Written out rather
 * than derived from the catalog so the catalog stays server-side.
 */
const strataComponents: StrataComponents = {
  approval: ({ element }) => <BrokenBlock type="approval"><Approval {...element.props} /></BrokenBlock>,
  "attachment-list": ({ element }) => <BrokenBlock type="attachment-list"><AttachmentList {...element.props} /></BrokenBlock>,
  accordion: ({ element }) => <BrokenBlock type="accordion"><Accordion {...element.props} /></BrokenBlock>,
  // BreakdownData sits outside the visual boundary so a failed chart chunk never hides the numbers.
  breakdown: ({ element }) => <><BrokenBlock type="breakdown"><Breakdown {...element.props} /></BrokenBlock><BreakdownData {...element.props} /></>,
  card: ({ element, children }) => <BrokenBlock type="card"><Card {...element.props}>{children}</Card></BrokenBlock>,
  carousel: ({ children }) => <BrokenBlock type="carousel"><Carousel>{children}</Carousel></BrokenBlock>,
  // ChartData sits outside the visual boundary so the data survives a failed recharts load.
  chart: ({ element }) => <><BrokenBlock type="chart"><Chart {...element.props} /></BrokenBlock><ChartData {...element.props} /></>,
  checklist: ({ element }) => <BrokenBlock type="checklist"><Checklist {...element.props} /></BrokenBlock>,
  "code-block": ({ element }) => <BrokenBlock type="code-block"><CodeBlock {...element.props} /></BrokenBlock>,
  comparison: ({ element }) => <BrokenBlock type="comparison"><Comparison {...element.props} /></BrokenBlock>,
  decision: ({ element }) => <BrokenBlock type="decision"><Decision {...element.props} /></BrokenBlock>,
  facts: ({ element }) => <BrokenBlock type="facts"><Facts {...element.props} /></BrokenBlock>,
  grid: ({ children }) => <BrokenBlock type="grid"><Grid>{children}</Grid></BrokenBlock>,
  "item-list": ({ element }) => <BrokenBlock type="item-list"><ItemList {...element.props} /></BrokenBlock>,
  "link-button": ({ element }) => <BrokenBlock type="link-button"><LinkButton {...element.props} /></BrokenBlock>,
  metric: ({ element }) => <BrokenBlock type="metric"><Metric {...element.props} /></BrokenBlock>,
  phases: ({ element }) => <BrokenBlock type="phases"><Phases {...element.props} /></BrokenBlock>,
  progress: ({ element }) => <BrokenBlock type="progress"><Progress {...element.props} /></BrokenBlock>,
  "reference-list": ({ element }) => <BrokenBlock type="reference-list"><ReferenceList {...element.props} /></BrokenBlock>,
  section: ({ element, children }) => <BrokenBlock type="section"><Section {...element.props}>{children}</Section></BrokenBlock>,
  prose: ({ element }) => <BrokenBlock type="prose"><Prose {...element.props} /></BrokenBlock>,
  quote: ({ element }) => <BrokenBlock type="quote"><Quote {...element.props} /></BrokenBlock>,
  callout: ({ element }) => <BrokenBlock type="callout"><Callout {...element.props} /></BrokenBlock>,
  "status-list": ({ element }) => <BrokenBlock type="status-list"><StatusList {...element.props} /></BrokenBlock>,
  "streak-grid": ({ element }) => <BrokenBlock type="streak-grid"><StreakGrid {...element.props} /></BrokenBlock>,
  table: ({ element }) => <BrokenBlock type="table"><Table {...element.props} /></BrokenBlock>,
  timeline: ({ element }) => <BrokenBlock type="timeline"><Timeline {...element.props} /></BrokenBlock>,
};

export const strataReactRegistry: ComponentRegistry = strataComponents;
