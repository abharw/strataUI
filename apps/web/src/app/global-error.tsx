"use client";

import { PageError } from "@/features/page-viewer/page-error";

/** Last resort: the root layout itself failed, so this owns <html>. */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <PageError retry={retry} />
      </body>
    </html>
  );
}
