import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
import { LightbulbIcon } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning";

import { AppIcon, type AppIconData } from "@/shared/ui/app-icon";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/primitives/alert";
import { cn } from "@/shared/ui/cn";
import { surfacePlain } from "@/page-content/surface";

const TONE_STYLE: Record<
  "note" | "tip" | "warning",
  { icon: AppIconData; iconClass: string; surface: string; label: string }
> = {
  note: {
    icon: InfoIcon,
    iconClass: "bg-foreground text-background",
    surface: "bg-transparent",
    label: "Note",
  },
  tip: {
    icon: LightbulbIcon,
    iconClass: "bg-status-info-foreground text-background",
    surface: "bg-transparent",
    label: "Tip",
  },
  warning: {
    icon: WarningIcon,
    iconClass: "bg-status-attention-foreground text-background",
    surface: "bg-transparent",
    label: "Important",
  },
};

export function Callout({
  text,
  tone,
}: {
  text: string;
  tone?: "note" | "tip" | "warning";
}) {
  const resolved = tone ?? "note";
  const style = TONE_STYLE[resolved];
  return (
    <Alert
      variant="quiet"
      role="note"
      className={cn(
        "grid grid-cols-[auto_1fr] items-start gap-x-3.5 border-border px-1 py-4 " + surfacePlain + " font-inherit text-foreground",
        style.surface,
      )}
      data-tone={resolved}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          style.iconClass,
        )}
        aria-hidden="true"
      >
        <AppIcon icon={style.icon} className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <AlertTitle className="text-meta font-medium text-muted-foreground">
          {style.label}
        </AlertTitle>
        <AlertDescription className="mt-1 whitespace-pre-wrap break-words text-ui leading-6 text-foreground">
          {text}
        </AlertDescription>
      </div>
    </Alert>
  );
}
