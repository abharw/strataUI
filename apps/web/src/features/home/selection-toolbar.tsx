"use client";

/**
 * Selection mode's header actions (`?select=1`) and the per-row checkbox. Verbs are 44px icon
 * buttons with tooltips and `aria-label`s so the toolbar fits one line at 320px.
 */
import { PushPinIcon } from "@phosphor-icons/react/dist/ssr/PushPin";
import { PushPinSlashIcon } from "@phosphor-icons/react/dist/ssr/PushPinSlash";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import { useState, useTransition, type ComponentProps, type ReactNode } from "react";

import { deletePages, deleteSpaces, setPagesPinned } from "@/app/(owner)/home/actions";
import { AppIcon, type AppIconData } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/primitives/tooltip";

import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { ChromeNotice } from "@/shared/ui/overflow-menu";
import { useTransientNotice } from "@/shared/ui/use-transient-notice";

type Pending = "pin" | "delete" | null;

/** "2 Pages and 1 Space", or either half alone, for the delete confirmation. */
export function selectionCounts(pageCount: number, spaceCount: number): string {
  const parts: string[] = [];
  if (pageCount > 0) parts.push(`${pageCount} Page${pageCount === 1 ? "" : "s"}`);
  if (spaceCount > 0) parts.push(`${spaceCount} Space${spaceCount === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

/**
 * A round 24px toggle inside a 44px target; the whole row is its label. Round to differ from the
 * square shared-Page tick, with a 2px border so it stays visible at a distance.
 */
export function SelectionCheckbox({
  name,
  checked,
  onCheckedChange,
  describedBy,
}: {
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  describedBy?: string;
}) {
  return (
    // Enter-only slide from the tree rail; exit swaps the row element, so nothing animates out.
    <span className="-my-1 grid size-control shrink-0 place-items-center transition-[opacity,transform] duration-200 ease-(--ease-out) starting:-translate-x-2 starting:opacity-0 motion-reduce:starting:translate-x-0">
      <Checkbox
        data-strata-selection-checkbox=""
        className="size-6 rounded-full border-2 border-control-border"
        aria-label={name}
        aria-describedby={describedBy}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
    </span>
  );
}

/** A 44px icon verb; the label is both the tooltip and the accessible name. */
function ToolbarAction({
  icon,
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size" | "type" | "variant"> & {
  icon: AppIconData;
  label: string;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          className={className}
        >
          <AppIcon icon={icon} className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function HomeSelectionToolbar({
  selectedPageIds,
  selectedSpaceIds,
  allSelectedPagesPinned,
  onExit,
}: {
  selectedPageIds: readonly string[];
  selectedSpaceIds: readonly string[];
  allSelectedPagesPinned: boolean;
  onExit: () => void;
}) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Pending>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useTransientNotice();

  const pageCount = selectedPageIds.length;
  const spaceCount = selectedSpaceIds.length;
  const total = pageCount + spaceCount;

  // Close the confirmation if the selection empties while it is open.
  if (confirming && total === 0) setConfirming(false);

  function run(kind: Exclude<Pending, null>, act: () => Promise<void>) {
    if (pending !== null) return;
    setPending(kind);
    setNotice(null);
    startTransition(async () => {
      try {
        await act();
      } catch {
        setNotice({ kind: "error", text: "Couldn’t finish that. Try again." });
      } finally {
        setPending(null);
      }
    });
  }

  function togglePinned() {
    const next = !allSelectedPagesPinned;
    run("pin", async () => {
      const result = await setPagesPinned([...selectedPageIds], next);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      // Keep the selection after pinning; curation often continues.
      setNotice({ kind: "success", text: result.notice ?? (next ? "Pinned" : "Unpinned") });
    });
  }

  function remove() {
    run("delete", async () => {
      // Pages first: a Space deletes its Pages, so the other order would remove unnamed Pages.
      if (pageCount > 0) {
        const result = await deletePages([...selectedPageIds]);
        if (!result.ok) {
          setNotice({ kind: "error", text: result.error });
          return;
        }
      }
      if (spaceCount > 0) {
        const result = await deleteSpaces([...selectedSpaceIds]);
        if (!result.ok) {
          setNotice({ kind: "error", text: result.error });
          return;
        }
      }
      setConfirming(false);
      // The actions revalidate Home, so the returned list already omits these rows.
      onExit();
      setNotice({ kind: "success", text: `Deleted ${total} item${total === 1 ? "" : "s"}` });
    });
  }

  return (
    <>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        <div data-strata-selection-toolbar="" className="flex shrink-0 origin-right items-center gap-1 transition-[opacity,transform] duration-[160ms] ease-(--ease-out) starting:scale-[0.96] starting:opacity-0 motion-reduce:starting:scale-100">
          {pageCount === 0 ? null : (
            <ToolbarAction
              icon={allSelectedPagesPinned ? PushPinSlashIcon : PushPinIcon}
              label={allSelectedPagesPinned ? "Unpin" : "Pin"}
              aria-busy={pending === "pin"}
              disabled={pending !== null}
              onClick={togglePinned}
            />
          )}
          {total === 0 ? null : (
            <ToolbarAction
              icon={TrashIcon}
              label="Delete"
              className="text-destructive hover:text-destructive"
              disabled={pending !== null}
              onClick={() => setConfirming(true)}
            />
          )}
          <ToolbarAction
            icon={XIcon}
            label="Done"
            className="ml-1"
            disabled={pending !== null}
            onClick={onExit}
          />
        </div>
      </TooltipProvider>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${selectionCounts(pageCount, spaceCount)}?`}
        description="They’re gone for everyone. Links to them stop opening. This can’t be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        destructive
        pending={pending === "delete"}
        onConfirm={remove}
      />
      <ChromeNotice notice={notice} />
    </>
  );
}
