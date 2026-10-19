"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { FolderSimpleIcon } from "@phosphor-icons/react/dist/ssr/FolderSimple";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  ChromeActionBody,
  ChromeActionContent,
  ChromeActionFooter,
  ChromeActionList,
  ChromeActionMenu,
  ChromeActionNotice,
  ChromeActionRow,
  ChromeActionTrigger,
} from "@/shared/ui/overflow-menu";

const LONG_LABEL = "Export the complete source-backed decision record for review";

function ContractSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`system-contract-${title}`} className="space-y-3 border-t border-border pt-5">
      <h2 id={`system-contract-${title}`} className="text-heading font-bold tracking-[-0.02em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Inspection-only composition of shared primitives, with no data or action handlers. */
export function SystemContractPreview() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-micro font-semibold text-muted-foreground">
          Development-only visual contract
        </p>
        <h1 className="text-title font-bold tracking-[-0.025em]">Shared system states</h1>
        <p className="max-w-prose text-supporting leading-6 text-muted-foreground">
          Inspect shared controls with deliberately difficult labels and state combinations. This page has no
          production data or action handlers.
        </p>
      </header>

      <ContractSection title="Button variants and states">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button">Default</Button>
          <Button type="button" size="action">Primary action</Button>
          <Button type="button" variant="secondary">Secondary</Button>
          <Button type="button" variant="outline">Outline</Button>
          <Button type="button" variant="ghost">Ghost</Button>
          <Button type="button" variant="destructive">Destructive</Button>
          <Button type="button" variant="link">Link</Button>
          <Button type="button" disabled>Disabled</Button>
          <Button type="button" disabled aria-busy="true">Saving…</Button>
        </div>
        <Button type="button" className="max-w-full whitespace-normal text-left leading-5">
          {LONG_LABEL}
        </Button>
      </ContractSection>

      <ContractSection title="Chrome actions and notices">
        <div className="rounded-contained border border-border p-3">
          <ChromeActionMenu>
            <ChromeActionTrigger label="Open inspection actions" />
            <ChromeActionContent
              title="Inspection actions"
              description="Shared action Drawer states for visual inspection."
            >
              <ChromeActionBody>
                <ChromeActionList aria-busy="false">
                  <ChromeActionRow icon={<AppIcon icon={DownloadSimpleIcon} aria-hidden />}>
                    {LONG_LABEL}
                  </ChromeActionRow>
                  <ChromeActionRow icon={<AppIcon icon={TrashIcon} aria-hidden />} variant="destructive">
                    Remove this preview-only artifact
                  </ChromeActionRow>
                  <ChromeActionRow icon={<AppIcon icon={DownloadSimpleIcon} aria-hidden />} disabled>
                    Preparing export…
                  </ChromeActionRow>
                </ChromeActionList>
              </ChromeActionBody>
              <ChromeActionNotice notice={{ kind: "success", text: "Success notice: the inspection state is visible and announced." }} />
              <ChromeActionFooter>
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" size="action">Keep</Button>
                  <Button type="button" size="action">Continue</Button>
                </div>
              </ChromeActionFooter>
            </ChromeActionContent>
          </ChromeActionMenu>
        </div>
        <div className="space-y-2 rounded-contained border border-border py-2">
          <ChromeActionNotice notice={{ kind: "success", text: "Success notice: a completed action remains visible." }} />
          <ChromeActionNotice notice={{ kind: "error", text: "Error notice: a failed action remains visible and assertive." }} />
        </div>
      </ContractSection>

      <ContractSection title="Empty states">
        <div className="rounded-contained border border-border px-page-gutter">
          <EmptyState title="No Pages yet." />
        </div>
        <div className="rounded-contained border border-border">
          <EmptyState
            size="screen"
            icon={FolderSimpleIcon}
            title="Nothing here yet."
            description="Create a Space to keep your first Pages in. Everything else follows from that."
            action={<Button type="button" size="action">Create a Space</Button>}
          />
        </div>
      </ContractSection>

      <ContractSection title="Inspection matrix">
        <ul className="list-disc space-y-2 pl-5 text-supporting leading-6 text-muted-foreground">
          <li>Resize the browser to 320 px, 390 px, and a desktop width; confirm labels wrap without clipping.</li>
          <li>Enable forced/high-contrast colors and confirm state meaning is still available in text and semantics.</li>
          <li>Enable reduced motion and open or close the Drawer; motion must be optional rather than required to understand state.</li>
          <li>Use keyboard focus through controls and confirm each active control retains a visible focus ring.</li>
        </ul>
      </ContractSection>
    </main>
  );
}
