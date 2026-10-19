import { describe, expect, it } from "vitest";

import { cn } from "@/shared/ui/cn";

import { buttonVariants } from "./button";

const sizes = ["default", "action", "lg", "icon", "icon-lg"] as const;

describe("button shape", () => {
  it.each(sizes)("keeps the %s size on a 44px touch target", (size) => {
    const classes = cn(buttonVariants({ size }));

    expect(classes).toMatch(/(?:h-control|h-control-lg|size-control)/);
  });

  it("pairs a hairline secondary action with a filled destructive action", () => {
    const hairline = cn(buttonVariants({ variant: "outline" }));
    const destructive = cn(buttonVariants({ variant: "destructive" }));

    expect(hairline).toContain("border-border");
    expect(hairline).toContain("bg-background");
    expect(destructive).toContain("bg-destructive");
    expect(destructive).toContain("text-destructive-foreground");
    expect(destructive).not.toContain("bg-destructive/10");
  });
});
