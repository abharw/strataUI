"use client";

import type { ReactNode } from "react";
import { Children, isValidElement, useCallback, useEffect, useState } from "react";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { cn } from "@/shared/ui/cn";
import {
  Carousel as CarouselPrimitive,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/shared/ui/primitives/carousel";

/**
 * Whether a slide is out of view. `null` means Embla has not measured yet, and nothing is hidden
 * then, since desktop CSS already shows two cards before measurement.
 */
export function slideHidden(inView: readonly number[] | null, index: number): boolean {
  return inView !== null && !inView.includes(index);
}

export function Carousel({ children }: { children?: ReactNode }) {
  const items = Children.toArray(children);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState<readonly number[] | null>(null);

  const syncPosition = useCallback((nextApi: NonNullable<CarouselApi>) => {
    setCurrent(nextApi.selectedScrollSnap());
    // An empty report means not yet measured; taken literally it would hide every card.
    const inView = nextApi.slidesInView();
    setVisible(inView.length > 0 ? inView : null);
  }, []);
  const setCarouselApi = useCallback((nextApi: CarouselApi) => {
    setApi(nextApi);
    if (!nextApi) return;
    // Embla positions the track with a transform and ignores scrollLeft, so reset any native
    // scroll from before enhancement.
    nextApi.rootNode().scrollLeft = 0;
    syncPosition(nextApi);
  }, [syncPosition]);

  useEffect(() => {
    if (!api) return;

    api.on("select", syncPosition);
    api.on("slidesInView", syncPosition);
    api.on("reInit", syncPosition);

    return () => {
      api.off("select", syncPosition);
      api.off("slidesInView", syncPosition);
      api.off("reInit", syncPosition);
    };
  }, [api, syncPosition]);

  if (items.length === 0) return null;

  if (items.length === 1) {
    return <div className="min-w-0">{items[0]}</div>;
  }

  return (
    <CarouselPrimitive
      setApi={setCarouselApi}
      opts={{ align: "start", containScroll: "trimSnaps" }}
      className={cn(
        "min-w-0 max-w-full overflow-hidden font-inherit text-foreground",
        // Scroll natively until Embla measures, so a late or failed enhancement still reaches every
        // card. Track width is the same either way, so hydration does not shift layout.
        visible === null && "[&_[data-slot=carousel-content]]:overflow-x-auto",
      )}
      aria-label={`${items.length} cards`}
      tabIndex={0}
    >
      <CarouselContent className="-ml-3">
        {items.map((child, index) => (
          <CarouselItem
            key={isValidElement(child) && child.key !== null ? child.key : `carousel-item-${index}`}
            aria-label={`${index + 1} of ${items.length}`}
            aria-hidden={slideHidden(visible, index) ? true : undefined}
            inert={slideHidden(visible, index) ? true : undefined}
            className="basis-[calc(100%-1.5rem)] pl-3 sm:basis-[calc(50%-0.375rem)] [&>*]:h-full"
          >
            {child}
          </CarouselItem>
        ))}
      </CarouselContent>

      <div className="mt-3 flex min-h-control items-center justify-between gap-2 px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-control shrink-0 rounded-full text-muted-foreground strata-press"
          onClick={() => api?.scrollPrev()}
          disabled={!api?.canScrollPrev()}
          aria-label="Previous card"
        >
          <AppIcon icon={CaretLeftIcon} aria-hidden="true" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          <p
            className="shrink-0 text-micro font-medium tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {current + 1} / {items.length}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-control shrink-0 rounded-full text-muted-foreground strata-press"
          onClick={() => api?.scrollNext()}
          disabled={!api?.canScrollNext()}
          aria-label="Next card"
        >
          <AppIcon icon={CaretRightIcon} aria-hidden="true" />
        </Button>
      </div>
    </CarouselPrimitive>
  );
}
