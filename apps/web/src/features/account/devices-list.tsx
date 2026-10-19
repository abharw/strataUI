"use client";

/**
 * Signed-in browsers in Home's management Drawer, with per-row and global sign-out. Signing out
 * this browser or everywhere is a `<form>` Server Action that redirects, so it works without JS.
 */
import { useActionState } from "react";

import { formatListTime, formatShortDay } from "@/shared/formatting/list-time";
import type { OwnerSessionSummary } from "@/server/auth/owner-session";
import { Button } from "@/shared/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@/shared/ui/primitives/item";
import { cn } from "@/shared/ui/cn";
import { revokeDevice, signOut, signOutEverywhere } from "@/app/(owner)/home/actions";
import type { OwnerActionResult } from "@/app/(owner)/home/action-result";

import { showChromeNotice } from "@/shared/ui/overflow-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { productRowAction, productTextMuted } from "@/shared/ui/styles";
import { useViewerClock, type ViewerClock } from "@/shared/formatting/viewer-clock";

/**
 * `client_label` is the browser's self-reported description at sign-in ("Safari on iPhone"), so
 * it is recognisable, not verified. "This device" leads so it survives truncation at 320px.
 */
function deviceName(session: OwnerSessionSummary): string {
  if (session.current) {
    return session.client_label === null
      ? "This device"
      : `This device · ${session.client_label}`;
  }
  return session.client_label ?? "Signed-in browser";
}

/** `Signed in Jul 2 · 15h ago`, on the viewer's calendar and clock. */
function metaText(session: OwnerSessionSummary, clock: ViewerClock | null): string {
  if (clock === null) return " ";
  if (session.revoked_at !== null) return `Signed out ${formatShortDay(session.revoked_at, clock)}`;
  const segments = [`Signed in ${formatShortDay(session.created_at, clock)}`];
  if (session.last_used_at !== null) segments.push(formatListTime(session.last_used_at, clock.now, clock));
  return segments.join(" · ");
}

/** Signs out another browser; this one stays where it is and Home revalidates. */
function RevokeDevice({ sessionId }: { sessionId: string }) {
  const [, revoke, busy] = useActionState<OwnerActionResult | null, FormData>(
    async () => {
      const result = await revokeDevice(sessionId);
      showChromeNotice(result.ok
        ? { kind: "success", text: "That browser is signed out." }
        : { kind: "error", text: "Couldn’t sign that browser out. Try again." });
      return result;
    },
    null,
  );

  return (
    <form action={revoke} className="shrink-0">
      <Button
        type="submit"
        variant="outline"
        aria-busy={busy}
        // `aria-disabled`, not `disabled`: disabling the focused control drops focus to <body>.
        aria-disabled={busy}
        onClick={(event) => {
          if (busy) event.preventDefault();
        }}
        className={cn("-mr-3", productRowAction)}
      >
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    </form>
  );
}

export function DevicesList({
  sessions,
  className,
}: {
  sessions: readonly OwnerSessionSummary[];
  className?: string;
}) {
  const clock = useViewerClock();
  const live = sessions.filter((session) => session.revoked_at === null);

  if (sessions.length === 0) {
    return <EmptyState title="No signed-in devices." className={className} />;
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <ItemGroup className="gap-0">
        {sessions.map((session) => {
          const revoked = session.revoked_at !== null;
          const metadata = metaText(session, clock);
          return (
            <Item
              key={session.id}
              role="listitem"
              // Signed-out rows are not dimmed, which would push the date below 2.4:1 contrast.
              className="border-0 px-0 py-2.5"
            >
              <ItemHeader className="min-h-control min-w-0 justify-start gap-3">
                <ItemTitle
                  title={deviceName(session)}
                  className="min-w-0 flex-1 truncate text-row leading-5"
                >
                  {deviceName(session)}
                </ItemTitle>
                {revoked ? null : (
                  <ItemActions className="shrink-0">
                    {session.current ? (
                      // This browser's row also expires the cookie, so it uses the redirecting action.
                      <form action={signOut} className="shrink-0">
                        <Button type="submit" variant="outline" className={cn("-mr-3", productRowAction)}>
                          Sign out
                        </Button>
                      </form>
                    ) : (
                      <RevokeDevice sessionId={session.id} />
                    )}
                  </ItemActions>
                )}
              </ItemHeader>
              <ItemDescription
                title={clock === null ? undefined : metadata}
                className={cn("basis-full truncate text-supporting leading-5", productTextMuted)}
              >
                {metadata}
              </ItemDescription>
            </Item>
          );
        })}
      </ItemGroup>
      {live.length > 1 ? (
        // Includes this browser, so it is the same redirecting form rather than a fetch.
        <form action={signOutEverywhere} className="mt-2 flex justify-end">
          <Button
            type="submit"
            variant="outline"
            className={productRowAction}
          >
            Sign out everywhere
          </Button>
        </form>
      ) : null}
    </div>
  );
}
