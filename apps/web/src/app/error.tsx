"use client";

import { PageError } from "@/features/page-viewer/page-error";

export default function Error({ retry }: { error: Error; retry: () => void }) {
  return <PageError retry={retry} />;
}
