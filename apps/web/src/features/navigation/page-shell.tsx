import type { ReactNode } from "react";

import { cn } from "@/shared/ui/cn";

/**
 * Server-safe page frame. `density` sets section gaps; `centered` places a short screen (sign-in)
 * on the optical centre while still scrolling once a keyboard or error makes it taller.
 */
export function PageShell({
  children,
  density = "page",
}: {
  children: ReactNode;
  density?: "page" | "list" | "centered";
}) {
  const centered = density === "centered";

  return (
    <>
      {/* The WebView gives load-time `:focus-visible` to the first focusable element, which
          revealed the skip link on touch devices. This `tabindex="-1"` anchor absorbs it. */}
      <span tabIndex={-1} aria-hidden className="sr-only" />
      <a href="#main-content" className="strata-skip-link">
        Skip to page
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-h-dvh bg-background px-page-gutter text-foreground sm:px-page-gutter-wide",
          centered && "flex flex-col",
        )}
        // `env(safe-area-inset-*)` is 0 inside the WebView (the Expo shell insets the top only),
        // so `max` gives 4.5rem in the app and the larger value in Safari.
        style={{
          colorScheme: "light",
          paddingTop: "max(1.75rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "max(4.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-strata flex-col",
            density === "page" && "gap-14 sm:gap-16",
            density === "list" && "gap-10 sm:gap-12",
            // `my-auto` centres while shorter than the viewport and collapses once taller.
            centered && "my-auto gap-10",
          )}
        >
          {children}
        </div>
      </main>
    </>
  );
}
