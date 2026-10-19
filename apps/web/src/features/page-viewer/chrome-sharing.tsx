"use client";

/**
 * Who can open this Page: its own link and the Space bundle. Membership is edited only on the
 * Space, so this panel links there.
 */

import { LinkBreakIcon } from "@phosphor-icons/react/dist/ssr/LinkBreak";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr/ShareNetwork";

import { AppIcon } from "@/shared/ui/app-icon";
import {
  ChromeActionBody,
  ChromeActionFooter,
  ChromeActionList,
  ChromeActionRow,
  ChromeActionRowLabel,
} from "@/shared/ui/overflow-menu";
import { productTextMuted } from "@/shared/ui/styles";
import { Button } from "@/shared/ui/primitives/button";

import { ChromeLinkField } from "./chrome-link-field";
import { usePageChrome } from "./chrome-state";

export function ChromeSharingPanel() {
  const {
    state: { pending, copiedLink },
    actions: { setConfirm },
    meta: { space, membership },
  } = usePageChrome();

  return (
    <ChromeActionBody className="gap-4" aria-busy={pending !== null}>
      <p className="text-body leading-6">
        Anyone with the Page link can read this Page.
      </p>
      {space === undefined ? null : (
        <div className="flex flex-col gap-2">
          <p className={`text-supporting leading-5 ${productTextMuted}`}>{membership}</p>
          <Button
            asChild
            variant="outline"
            size="action"
            className="w-full justify-start gap-3 px-4 text-body font-medium"
          >
            <a href={space.url}>
              <AppIcon icon={ShareNetworkIcon} data-icon="inline-start" />
              Manage Space sharing
            </a>
          </Button>
        </div>
      )}
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
      <p className="sr-only" role="status" aria-live="polite">
        {copiedLink ? "Page link copied" : ""}
      </p>
      <ChromeLinkField />
    </ChromeActionBody>
  );
}

export function ChromeSharingFooter() {
  const { actions: { leaveSharing } } = usePageChrome();
  return (
    <ChromeActionFooter>
      <Button type="button" variant="outline" size="action" onClick={leaveSharing}>
        Done
      </Button>
    </ChromeActionFooter>
  );
}
