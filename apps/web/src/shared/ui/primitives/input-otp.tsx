"use client"

import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"

import { cn } from "@/shared/ui/cn"

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        // `aria-invalid` lands on the hidden input, a sibling of the group, so style it from here.
        "cn-input-otp flex items-center has-disabled:opacity-50 has-aria-invalid:[&>[data-slot=input-otp-group]]:border-control-border-invalid",
        containerClassName
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  // The focused hidden input is a sibling of this group, so `:focus-within` cannot drive the ring.
  const { isFocused } = React.useContext(OTPInputContext) ?? {}

  return (
    <div
      data-slot="input-otp-group"
      data-focused={isFocused === true ? "true" : "false"}
      className={cn(
        "flex h-control-lg w-full overflow-hidden rounded-full border border-control-border transition-[border-color,box-shadow] duration-100 ease-out data-[focused=true]:border-ring data-[focused=true]:ring-3 data-[focused=true]:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        // Hairline dividers and an active tint rather than a ring per slot.
        "relative flex h-full flex-1 min-w-0 items-center justify-center border-l border-product-divider first:border-l-0 text-heading font-medium tabular-nums outline-none transition-[background-color] duration-100 ease-out data-[active=true]:bg-product-active-subtle",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot }
