/** Fixture: exact technical text plus quiet evidence links. */
import type { StrataSpec } from "@/page-content/schema";
import type { Meta } from "@/page-content/document/types";

type PageFixture = { meta: Meta; spec: StrataSpec };

export const releaseReview: PageFixture = {
  meta: {
    title: "Release review",
    slug: "strata-release-review",
    kind: "standing",
    source_event: {
      id: "msg_release_review_01",
      at: "2026-08-22T14:30:00-06:00",
      excerpt: "prepare Strata for deployment",
    },
    url: "/share/pgk_example-release-key",
    written_registry_version: 4,
    created_at: "2026-08-22T14:30:10-06:00",
    updated_at: "2026-08-22T14:42:00-06:00",
  },
  spec: {
    answer: {
      verdict: "Cut over to the canonical JSON Render spec at registry 4. Deployment values and evidence below.",
    },
    root: "release-review",
    elements: {
      "release-review": {
        type: "section",
        props: {},
        children: ["registry-version", "release-note", "rollout", "configuration", "change", "evidence"],
      },
      "registry-version": {
        type: "metric",
        props: {
          label: "Registry",
          value: 4,
          change: { value: "+1", direction: "up", polarity: "good" },
          trend: [1, 2, 3, 4],
        },
        children: [],
      },
      "release-note": {
        type: "callout",
        props: {
          text: "The public contract now uses one canonical JSON Render spec. These are the exact deployment values and the evidence used for the cutover.",
          tone: "note",
        },
        children: [],
      },
      rollout: {
        type: "section",
        props: { title: "Rollout" },
        children: ["cutover-progress"],
      },
      "cutover-progress": {
        type: "progress",
        props: {
          label: "Readers on the canonical spec",
          current: { value: 3400, unit: "readers" },
          target: { value: 4000, unit: "readers" },
          target_at: "2026-08-29",
          presentation: "ring",
        },
        children: [],
      },
      configuration: {
        type: "section",
        props: { title: "Configuration" },
        children: ["environment"],
      },
      environment: {
        type: "code-block",
        props: {
          code: "PUBLIC_BASE_URL=https://strata.example\nPOLL_INTERVAL_MS=3000\nREGISTRY_VERSION=4",
          language: "dotenv",
          filename: ".env.production",
          kind: "code",
        },
        children: [],
      },
      change: {
        type: "section",
        props: { title: "Contract change" },
        children: ["shape-diff"],
      },
      "shape-diff": {
        type: "code-block",
        props: {
          code: "- { tree: { nodes: {} } }\n+ { spec: { root, elements } }",
          language: "diff",
          filename: "page-contract.diff",
          kind: "diff",
        },
        children: [],
      },
      evidence: {
        type: "section",
        props: { title: "References" },
        children: ["sources"],
      },
      sources: {
        type: "reference-list",
        props: {
          items: [
            {
              id: "catalog-docs",
              title: "Catalogs",
              url: "https://json-render.dev/docs/catalog",
              source: "JSON Render",
              note: "Defines the model-facing component vocabulary.",
            },
            {
              id: "registry-docs",
              title: "Registry",
              url: "https://json-render.dev/docs/registry",
              source: "JSON Render",
              note: "Maps catalog types to native React renderers.",
            },
          ],
        },
        children: [],
      },
    },
  },
};
