"use client";

/**
 * The Page Drawer's top-level rows as one ordered registry, each with an audience: copy first,
 * curation second, access one level in, delete last.
 */

import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CopyIcon } from "@phosphor-icons/react/dist/ssr/Copy";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { PushPinIcon } from "@phosphor-icons/react/dist/ssr/PushPin";
import { PushPinSlashIcon } from "@phosphor-icons/react/dist/ssr/PushPinSlash";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/ssr/SpinnerGap";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import type { ReactNode } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import {
  ChromeActionBody,
  ChromeActionList,
  ChromeActionRow,
  ChromeActionRowLabel,
} from "@/shared/ui/overflow-menu";

import { ChromeLinkField } from "./chrome-link-field";
import { usePageChrome } from "./chrome-state";
import { PAGE_TEXT_COPIED } from "./use-page-text-copy";

type ChromeRow = {
  id: string;
  audience: "everyone" | "owner";
  row: ReactNode;
};

export function ChromeActionsPanel() {
  const {
    state: { pending, copiedLink },
    actions: { togglePin, copyLink, copyPageText, setNotice, setPanel, setConfirm },
    meta: { owner, user, copyUrl, membership, pageText, copyActionRef, sharingActionRef },
  } = usePageChrome();

  const chromeRows: ChromeRow[] = [
    {
      id: "copy-link",
      audience: "everyone",
      row: copyUrl === null ? null : (
        <ChromeActionRow
          ref={copyActionRef}
          icon={<AppIcon
            icon={pending === "copy" ? SpinnerGapIcon : copiedLink ? CheckIcon : LinkIcon}
            className={
              pending === "copy"
                ? "animate-spin motion-reduce:animate-none"
                : copiedLink
                  ? "text-status-success-foreground"
                  : undefined
            }
          />}
          aria-busy={pending === "copy"}
          disabled={pending !== null}
          onClick={() => void copyLink(copyUrl)}
        >
          <ChromeActionRowLabel note="Opens this Page only">
            {pending === "copy" ? "Copying…" : copiedLink ? "Copied" : "Copy Page link"}
          </ChromeActionRowLabel>
        </ChromeActionRow>
      ),
    },
    {
      id: "copy-text",
      audience: "everyone",
      row: (
        <ChromeActionRow
          icon={<AppIcon
            icon={pageText.state === "copied" ? CheckIcon : CopyIcon}
            className={pageText.state === "copied" ? "text-status-success-foreground" : undefined}
          />}
          disabled={pending !== null}
          onClick={() => void copyPageText()}
        >
          <ChromeActionRowLabel note="The whole Page, as text you can paste">
            {pageText.state === "copied" ? "Copied" : "Copy Page text"}
          </ChromeActionRowLabel>
        </ChromeActionRow>
      ),
    },
    {
      id: "pin",
      audience: "owner",
      row: (
        <ChromeActionRow
          icon={<AppIcon
            icon={pending === "pin"
              ? SpinnerGapIcon
              : user.pinned ? PushPinSlashIcon : PushPinIcon}
            className={pending === "pin" ? "animate-spin motion-reduce:animate-none" : undefined}
          />}
          aria-busy={pending === "pin"}
          disabled={pending !== null}
          onClick={() => togglePin(!user.pinned)}
        >
          {pending === "pin" ? "Updating…" : user.pinned ? "Unpin" : "Pin"}
        </ChromeActionRow>
      ),
    },
    {
      // One row over one panel covering both the Page link and the Space bundle.
      id: "sharing",
      audience: "owner",
      row: (
        <ChromeActionRow
          ref={sharingActionRef}
          icon={<AppIcon icon={ShareNetworkIcon} />}
          disabled={pending !== null}
          onClick={() => {
            setNotice(null);
            setPanel("sharing");
          }}
        >
          <ChromeActionRowLabel note={membership}>Sharing</ChromeActionRowLabel>
        </ChromeActionRow>
      ),
    },
    {
      id: "delete",
      audience: "owner",
      row: (
        <ChromeActionRow
          icon={<AppIcon icon={TrashIcon} />}
          disabled={pending !== null}
          variant="destructive"
          onClick={() => setConfirm("delete")}
        >
          Delete
        </ChromeActionRow>
      ),
    },
  ];
  const visibleRows = chromeRows.filter(
    (entry) => entry.row !== null && (entry.audience === "everyone" || owner !== null),
  );

  return (
    <ChromeActionBody aria-busy={pending !== null}>
      <ChromeActionList>
        {visibleRows.map((entry) => (
          <div key={entry.id}>{entry.row}</div>
        ))}
      </ChromeActionList>
      {/* The copy announcement; the check mark itself is silent. */}
      <p className="sr-only" role="status" aria-live="polite">
        {copiedLink
          ? "Page link copied"
          : pageText.state === "copied"
            ? PAGE_TEXT_COPIED
            : ""}
      </p>
      {/* Shown only after a clipboard refusal, which repeats on every retry. */}
      <ChromeLinkField />
    </ChromeActionBody>
  );
}
