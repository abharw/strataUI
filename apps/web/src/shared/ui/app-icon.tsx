import type {
  Icon,
  IconProps,
  IconWeight,
} from "@phosphor-icons/react/dist/lib/types";

export type AppIconData = Icon;

type AppIconProps = Omit<IconProps, "weight"> & {
  icon: AppIconData;
  weight?: IconWeight;
};

/** Decorative Phosphor glyph with one app-owned sizing and accessibility contract. */
export function AppIcon({ icon: IconComponent, weight = "regular", ...props }: AppIconProps) {
  return (
    <IconComponent
      weight={weight}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}
