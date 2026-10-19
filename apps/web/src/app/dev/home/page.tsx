import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isProductionDeployment } from "@/app/dev/system/access";

export function generateMetadata(): Metadata {
  return {
    robots: { index: false },
    title: "Home preview",
  };
}

// Module-level literal so the bundler drops the preview from production builds.
const loadPreview = process.env.NODE_ENV === "production" ? null : () => import("./preview");

export default async function HomePreviewPage() {
  // The runtime check also covers a non-production build deployed to production.
  if (loadPreview === null || isProductionDeployment()) notFound();
  const { HomePreview } = await loadPreview();
  return <HomePreview />;
}
