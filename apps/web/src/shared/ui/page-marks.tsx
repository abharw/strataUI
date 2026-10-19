import { LockSimpleIcon } from "@phosphor-icons/react/dist/ssr/LockSimple";
import { PushPinIcon } from "@phosphor-icons/react/dist/ssr/PushPin";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr/UsersThree";

import { AppIcon } from "./app-icon";

import { productTextMuted } from "./styles";

// Page row status marks: a distinct glyph plus an `sr-only` word, never colour alone.

/**
 * Worded as Space link membership: a page's own `pgk_` link works regardless of `shared`, which
 * only controls whether the page appears at its Space's shared URL.
 */
const EXPOSURE_SHARED = "Shared in Space link";
const EXPOSURE_PRIVATE = "Not shared in Space link";

export function ExposureMark({ shared }: { shared: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${productTextMuted}`}>
      <AppIcon
        icon={shared ? UsersThreeIcon : LockSimpleIcon}
        aria-hidden
        className="size-3.5"
        weight={shared ? "fill" : "regular"}
      />
      <span className="sr-only">{shared ? EXPOSURE_SHARED : EXPOSURE_PRIVATE}</span>
    </span>
  );
}

export function PinnedMark() {
  return (
    <span className={`inline-flex shrink-0 ${productTextMuted}`}>
      <AppIcon icon={PushPinIcon} aria-hidden className="size-3.5" weight="fill" />
      <span className="sr-only">Pinned</span>
    </span>
  );
}
