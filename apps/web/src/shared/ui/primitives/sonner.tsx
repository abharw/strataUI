"use client"

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle"
import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info"
import { SpinnerIcon } from "@phosphor-icons/react/dist/ssr/Spinner"
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning"
import { XCircleIcon } from "@phosphor-icons/react/dist/ssr/XCircle"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Safari puts the home indicator inside the viewport, so add the bottom inset. Inside the app's
// SafeAreaView it resolves to 0px, so it is not doubled.
const bottomOffset = "calc(env(safe-area-inset-bottom, 0px) + var(--spacing-page-gutter-wide))"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      offset={{ bottom: bottomOffset }}
      mobileOffset={{ bottom: bottomOffset }}
      containerAriaLabel="Notifications"
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon aria-hidden="true" focusable="false" />
        ),
        info: (
          <InfoIcon aria-hidden="true" focusable="false" />
        ),
        warning: (
          <WarningIcon aria-hidden="true" focusable="false" />
        ),
        error: (
          <XCircleIcon aria-hidden="true" focusable="false" />
        ),
        loading: (
          <SpinnerIcon
            aria-hidden="true"
            focusable="false"
            className="animate-spin motion-reduce:animate-none"
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
