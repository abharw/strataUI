"use client";

/** The Space Drawer's top-level rows: copy, sharing (see `space-menu-sharing`), delete. */

import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";

import { AppIcon } from "@/shared/ui/app-icon";

import {
  ChromeActionBody,
  ChromeActionList,
  ChromeActionRow,
  ChromeActionRowLabel,
} from "@/shared/ui/overflow-menu";
import { SpaceLinkField } from "./space-link-field";
import { useSpaceMenu } from "./space-menu-state";

export function SpaceMenuActionsPanel() {
  const {
    state: { pending, copied, shareUrl },
    actions: { openSelection, copyExisting, setConfirm },
    meta: { includedPageCount, pageCountLabel, shareActionRef },
  } = useSpaceMenu();

  return (
    <ChromeActionBody>
      <ChromeActionList aria-busy={pending !== null}>
        {shareUrl === null ? (
          <ChromeActionRow
            ref={shareActionRef}
            icon={<AppIcon icon={ShareNetworkIcon} />}
            disabled={pending !== null}
            onClick={openSelection}
          >
            <ChromeActionRowLabel note="One link for the Pages you choose">Share Space</ChromeActionRowLabel>
          </ChromeActionRow>
        ) : (
          <ChromeActionRow
            ref={shareActionRef}
            icon={<AppIcon
              icon={copied ? CheckIcon : LinkIcon}
              className={copied ? "text-status-success-foreground" : undefined}
            />}
            disabled={pending !== null}
            onClick={copyExisting}
          >
            <ChromeActionRowLabel note={`Opens the ${includedPageCount} shared Page${includedPageCount === 1 ? "" : "s"}`}>
              {copied ? "Copied" : "Copy Space link"}
            </ChromeActionRowLabel>
          </ChromeActionRow>
        )}
        {shareUrl === null ? null : (
          <ChromeActionRow
            icon={<AppIcon icon={ShareNetworkIcon} />}
            disabled={pending !== null}
            onClick={openSelection}
          >
            <ChromeActionRowLabel note={`${includedPageCount} of ${pageCountLabel}`}>Sharing</ChromeActionRowLabel>
          </ChromeActionRow>
        )}
        <ChromeActionRow
          icon={<AppIcon icon={TrashIcon} />}
          variant="destructive"
          disabled={pending !== null}
          onClick={() => setConfirm("delete")}
        >
          Delete Space
        </ChromeActionRow>
      </ChromeActionList>
      {/* The copy announcement; the row's Copied state is silent. */}
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Space link copied" : ""}
      </p>
      {/* Shown only after a clipboard refusal. */}
      <SpaceLinkField />
    </ChromeActionBody>
  );
}
