import { ChromeTitle } from "@/features/navigation/chrome-title";
import { productTextMuted } from "@/shared/ui/styles";

/** A one-page bundle still presents its container as a Space. */
export function DocumentSpaceHeading({
  name,
  emoji,
  detail,
}: {
  name: string;
  emoji: string;
  detail: string;
}) {
  return (
    <header className="min-w-0 px-0.5 pt-1 sm:pt-3">
      <p className={`mb-1 text-micro font-medium leading-5 ${productTextMuted}`}>Space</p>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span aria-hidden className="shrink-0 text-heading leading-none">{emoji}</span>
        <ChromeTitle>{name}</ChromeTitle>
      </div>
      <p className={`mt-1.5 text-supporting leading-5 ${productTextMuted}`}>{detail}</p>
    </header>
  );
}
