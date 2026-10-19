import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isProductionDeployment } from "./access";

export function generateMetadata(): Metadata {
  return {
    robots: { index: false },
    title: "System visual contract",
  };
}

// Module-level literal so the bundler drops the preview from production builds.
const loadPreview = process.env.NODE_ENV === "production"
  ? null
  : () => import("./system-contract-preview");

export default async function SystemContractPage() {
  // The runtime check also covers a non-production build deployed to production.
  if (loadPreview === null || isProductionDeployment()) notFound();
  const { SystemContractPreview } = await loadPreview();
  return <SystemContractPreview />;
}
