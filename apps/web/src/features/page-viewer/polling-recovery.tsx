"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { WifiSlashIcon } from "@phosphor-icons/react/dist/ssr/WifiSlash";

import { AppIcon } from "@/shared/ui/app-icon";
import { Alert, AlertDescription } from "@/shared/ui/primitives/alert";
import { Button } from "@/shared/ui/primitives/button";
import { productTextMuted } from "@/shared/ui/styles";

/**
 * A failed poll may be network, server or a malformed response. The store keeps the last good
 * snapshot, so the notice says that rather than "offline".
 */
export function PollingRecoveryNotice({
  updatedAt,
  updated,
  updatedExact,
}: {
  updatedAt: string;
  updated: string;
  updatedExact: string;
}) {
  return (
    <Alert
      variant="quiet"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Update check unavailable"
      className="grid min-w-0 grid-cols-[auto_1fr] items-start gap-x-3 border-product-divider px-1 py-3.5 text-ui leading-5"
    >
      <AppIcon
        icon={WifiSlashIcon}
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 ${productTextMuted}`}
      />
      <AlertDescription className="min-w-0 break-words text-ui leading-5 text-foreground">
        <span className="font-semibold">Updates couldn’t be checked.</span>
        <span className={productTextMuted}>
          <span aria-hidden> </span>
          Showing the last verified page, updated <time dateTime={updatedAt} title={updatedExact}>{updated}</time>. We’ll keep trying.
        </span>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Registry skew that survived the one automatic reload (cache, lagging edge, rolling deploy).
 * Polling has stopped; the last good version stays on screen with a manual refresh.
 */
export function StaleBundleNotice() {
  return (
    <Alert
      variant="quiet"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="This page needs a refresh"
      className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-3 border-product-divider px-1 py-3.5 text-ui leading-5"
    >
      <AlertDescription className="min-w-0 break-words text-ui leading-5 text-foreground">
        <span className="font-semibold">This page needs a refresh.</span>
        <span className={productTextMuted}>
          <span aria-hidden> </span>
          A newer Strata is live and this tab has stopped checking for updates.
        </span>
      </AlertDescription>
      <Button
        type="button"
        variant="secondary"
        className="shrink-0"
        onClick={() => window.location.reload()}
      >
        <AppIcon icon={ArrowClockwiseIcon} data-icon="inline-start" />
        Refresh
      </Button>
    </Alert>
  );
}
