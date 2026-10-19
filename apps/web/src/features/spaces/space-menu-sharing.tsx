"use client";

/** Space sharing panel: which Pages the link carries, the link reset, and the Cancel/Save footer. */

import { LinkBreakIcon } from "@phosphor-icons/react/dist/ssr/LinkBreak";
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/ssr/SpinnerGap";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/primitives/field";

import {
  ChromeActionBody,
  ChromeActionFooter,
  ChromeActionList,
  ChromeActionRow,
  ChromeActionRowLabel,
} from "@/shared/ui/overflow-menu";
import { SpaceLinkField } from "./space-link-field";
import { useSpaceMenu } from "./space-menu-state";
import { productTextMuted } from "@/shared/ui/styles";

export function SpaceMenuSharingPanel() {
  const {
    state: { pending, copied, shareUrl, draftSelection },
    actions: { setPageSelected, selectAllPages, clearPages, setConfirm },
    meta: { spaceId, selectionPages, selectedLabel, firstSelectionRef },
  } = useSpaceMenu();

  return (
    <ChromeActionBody className="gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className={`text-supporting font-medium leading-5 ${productTextMuted}`}>Pages</p>
        {selectionPages.length === 0 ? null : (
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              className="px-4 text-supporting"
              disabled={pending !== null || draftSelection.size === selectionPages.length}
              onClick={selectAllPages}
            >
              All
            </Button>
            <Button
              type="button"
              variant="outline"
              className="px-4 text-supporting"
              disabled={pending !== null || draftSelection.size === 0}
              onClick={clearPages}
            >
              None
            </Button>
          </div>
        )}
      </div>
      {selectionPages.length === 0 ? (
        <p className={`rounded-control border border-border px-4 py-5 text-body leading-6 ${productTextMuted}`}>
          This Space has no Pages yet. You can still create its link.
        </p>
      ) : (
        <FieldSet>
          <FieldLegend className="sr-only">Pages to include</FieldLegend>
          <FieldGroup className="gap-2">
            {selectionPages.map((page, index) => {
              const checkboxId = `space-${spaceId}-page-${page.id}`;
              return (
                <Field
                  key={page.id}
                  orientation="horizontal"
                  className="min-h-control-lg items-center rounded-control border border-border px-3 py-3 hover:bg-muted/50"
                >
                  <Checkbox
                    ref={index === 0 ? firstSelectionRef : undefined}
                    id={checkboxId}
                    checked={draftSelection.has(page.id)}
                    disabled={pending !== null}
                    onCheckedChange={(checked) => setPageSelected(page.id, checked === true)}
                  />
                  <FieldLabel
                    htmlFor={checkboxId}
                    className="min-w-0 cursor-pointer text-body font-medium leading-5"
                  >
                    {/* Two lines before clipping, so titles with a shared prefix stay distinct. */}
                    <span className="line-clamp-2 min-w-0 break-words">{page.title}</span>
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      )}
      {/* One polite region: the checklist count, or the clipboard result. */}
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Space link copied" : selectedLabel}
      </p>
      {shareUrl === null ? null : (
        <ChromeActionList>
          <ChromeActionRow
            icon={<AppIcon icon={LinkBreakIcon} />}
            variant="destructive"
            disabled={pending !== null}
            onClick={() => setConfirm("rotate")}
          >
            <ChromeActionRowLabel note="Everyone with the current link loses access. You get a new link.">
              Reset link
            </ChromeActionRowLabel>
          </ChromeActionRow>
        </ChromeActionList>
      )}
      <SpaceLinkField />
    </ChromeActionBody>
  );
}

export function SpaceMenuSharingFooter() {
  const {
    state: { pending, shareUrl, selectionStale },
    actions: { cancelPanel, saveSelection },
    meta: { firstPanelActionRef },
  } = useSpaceMenu();

  return (
    <ChromeActionFooter>
      <div className="grid grid-cols-2 gap-3">
        <Button
          ref={firstPanelActionRef}
          type="button"
          variant="outline"
          size="action"
          disabled={pending !== null}
          onClick={cancelPanel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="action"
          aria-busy={pending !== null}
          disabled={pending !== null || selectionStale}
          onClick={saveSelection}
        >
          {pending !== null ? (
            <AppIcon
              icon={SpinnerGapIcon}
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {pending === "share"
            ? "Saving…"
            : shareUrl === null ? "Create link" : "Save"}
        </Button>
      </div>
    </ChromeActionFooter>
  );
}
