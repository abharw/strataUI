"use client";

import { createContext, type ReactNode } from "react";

import type { AttachmentResources } from "@/page-content/attachments/resources";

/**
 * Lives apart from the gallery so pages can provide asset metadata without importing the
 * `attachment-list` dynamic leaf (and its Drawer) into first load.
 */
export const AttachmentResolverContext = createContext<AttachmentResources>({});

export function AttachmentResolverProvider({
  assets,
  children,
}: {
  assets: AttachmentResources;
  children: ReactNode;
}) {
  return (
    <AttachmentResolverContext.Provider value={assets}>
      {children}
    </AttachmentResolverContext.Provider>
  );
}
