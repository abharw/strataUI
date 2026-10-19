"use client";

/**
 * The "⋯" action Drawer shared by owner chrome, with 44px rows. Destructive confirmations use a
 * `ConfirmDialog` stacked over it.
 */
import { DotsThreeIcon } from "@phosphor-icons/react/dist/ssr/DotsThree";
import Link from "next/link";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { AppIcon } from "./app-icon";
import { Alert, AlertDescription } from "@/shared/ui/primitives/alert";
import { Button } from "@/shared/ui/primitives/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/shared/ui/primitives/drawer";
import { Toaster } from "@/shared/ui/primitives/sonner";
import { cn } from "./cn";

import { productPressSubtle, productTextMuted } from "./styles";
import {
  CHROME_NOTICE_DURATION_MS,
  type ChromeNoticeValue,
} from "./use-transient-notice";

export type { ChromeNoticeValue } from "./use-transient-notice";

/** The Drawer root. Domain components own `open`; a trigger is optional. */
export function ChromeActionMenu(props: ComponentProps<typeof Drawer>) {
  return <Drawer showSwipeHandle {...props} />;
}

/** The 44px ellipsis trigger for owner-chrome action Drawers. */
export function ChromeActionTrigger({
  label,
  className,
  ...props
}: Omit<
  ComponentProps<typeof Button>,
  "aria-haspopup" | "aria-label" | "asChild" | "children" | "size" | "type" | "variant"
> & {
  label: string;
}) {
  return (
    <DrawerTrigger
      render={(
        <Button
          {...props}
          type="button"
          variant="ghost"
          size="icon"
          data-chrome-action-trigger=""
          className={cn(
            "size-control shrink-0 rounded-full shadow-none",
            "strata-press",
            productTextMuted,
            className,
          )}
          aria-label={label}
        />
      )}
    >
      <AppIcon icon={DotsThreeIcon} className="size-6" weight="bold" />
    </DrawerTrigger>
  );
}

export function ChromeActionContent({
  title,
  description,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof DrawerContent>, "children"> & {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <DrawerContent
      data-chrome-action-content=""
      className={cn(
        // Hug the rows up to a ceiling; past it the body scrolls.
        "mx-auto w-full max-w-2xl bg-background [--drawer-height:auto] [--drawer-max-height:min(42rem,68dvh)]",
        className,
      )}
      {...props}
    >
      <DrawerHeader className="border-b border-border/60 pb-5">
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>{description}</DrawerDescription>
      </DrawerHeader>
      {children}
    </DrawerContent>
  );
}

export function ChromeActionBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-chrome-action-body=""
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-4", className)}
      {...props}
    />
  );
}

export function ChromeActionList({ className, ...props }: ComponentProps<"div">) {
  return <div data-chrome-action-list="" className={cn("flex flex-col gap-3", className)} {...props} />;
}

/** Shared row styling. Rows are medium weight so the semibold header title ranks above them. */
const CHROME_ACTION_ROW =
  "h-auto! min-h-control-lg w-full cursor-pointer items-center justify-start gap-3 whitespace-normal rounded-control px-3 py-3 text-left text-body font-medium leading-5 [&_svg:not([class*='size-'])]:size-5 "
  + productPressSubtle;

/** An action row. The caller closes the Drawer once its work has landed. */
export function ChromeActionRow({
  icon,
  className,
  variant = "default",
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "variant"> & {
  icon: ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <Button
      {...props}
      type="button"
      variant="ghost"
      data-chrome-action-row=""
      className={cn(
        CHROME_ACTION_ROW,
        variant === "destructive" ? "mt-2 text-destructive" : undefined,
        className,
      )}
    >
      <span data-icon="inline-start" className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </Button>
  );
}

/**
 * A navigating row. Renders a real anchor so it works in a new tab and before hydration, styled
 * like `ChromeActionRow`.
 */
export function ChromeActionLinkRow({
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { icon: ReactNode }) {
  return (
    <Button asChild variant="ghost" className={cn(CHROME_ACTION_ROW, className)}>
      <Link {...props} data-chrome-action-row="">
        <span data-icon="inline-start" className="shrink-0">
          {icon}
        </span>
        <span className="min-w-0 break-words">{children}</span>
      </Link>
    </Button>
  );
}

/** Writes to the clipboard and reports success instead of throwing (policies and webviews deny it). */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A row label with a one-line consequence note, since tooltips are unusable on phones. */
export function ChromeActionRowLabel({ children, note }: { children: ReactNode; note: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{children}</span>
      <span className={`text-supporting font-normal ${productTextMuted}`}>{note}</span>
    </span>
  );
}

export function ChromeActionFooter({ className, ...props }: ComponentProps<typeof DrawerFooter>) {
  return (
    <DrawerFooter
      data-chrome-action-footer=""
      className={cn("border-t border-border/60 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]", className)}
      {...props}
    />
  );
}

/** Drawer-local feedback stays above the footer instead of covering it. */
export function ChromeActionNotice({ notice }: { notice: ChromeNoticeValue }) {
  if (notice === null) return null;
  return (
    <Alert
      variant={notice.kind === "error" ? "destructive" : "default"}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      data-chrome-action-notice=""
      className={cn(
        "mx-5 mt-3 mb-[max(1.25rem,env(safe-area-inset-bottom,0px))] w-auto px-3 py-3",
        notice.kind === "error"
          ? "bg-destructive/10"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      <AlertDescription
        className={cn(
          "text-supporting font-medium leading-5",
          notice.kind === "error" ? "text-destructive" : "text-secondary-foreground",
        )}
      >
        {notice.text}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Live region for notices from closed menus. Mounted by owner chrome (Home and the live page) so
 * screens without toasts do not ship sonner.
 */
export function ChromeNoticeRegion() {
  return <Toaster />;
}

export function showChromeNotice(notice: Exclude<ChromeNoticeValue, null>) {
  // Toasts with an action stay up longer so the reader has time to use it.
  const options = {
    duration: notice.action === undefined
      ? CHROME_NOTICE_DURATION_MS[notice.kind]
      : CHROME_NOTICE_DURATION_MS.action,
    ...(notice.action === undefined
      ? {}
      : { action: { label: notice.action.label, onClick: notice.action.act } }),
  };
  return notice.kind === "error"
    ? toast.error(notice.text, options)
    : toast.success(notice.text, options);
}

/** Sends actions that close their own Drawer to the app-level Sonner live region. */
export function ChromeNotice({ notice }: { notice: ChromeNoticeValue }) {
  useEffect(() => {
    if (notice !== null) showChromeNotice(notice);
  }, [notice]);

  return null;
}
