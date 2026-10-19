import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isProductionDeployment } from "@/app/dev/system/access";

export function generateMetadata(): Metadata {
  return {
    robots: { index: false },
    title: "Dev fixtures",
  };
}

// A module-level literal comparison lets the bundler fold this to `null` in production and drop
// the whole gallery graph.
const loadGallery = process.env.NODE_ENV === "production" ? null : () => import("./gallery");

export default async function DevFixturesPage() {
  // The runtime check also covers a non-production build deployed to production.
  if (loadGallery === null || isProductionDeployment()) notFound();
  const { FixtureGallery } = await loadGallery();
  return <FixtureGallery />;
}
