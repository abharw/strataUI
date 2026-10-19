"use client";

/** Home's greeting. It depends on the viewer's hour, so it cannot render on the server. */

import { useSyncExternalStore } from "react";

import { ChromeTitle } from "@/features/navigation/chrome-title";

/** 5-11 morning, 12-16 afternoon, otherwise evening; greets by first name. */
function greetingFor(hour: number, personName: string): string {
  const part = hour >= 5 && hour <= 11
    ? "morning"
    : hour >= 12 && hour <= 16
      ? "afternoon"
      : "evening";
  return `Good ${part}, ${firstName(personName)}`;
}

function firstName(personName: string): string {
  const [first = personName] = personName.trim().split(/\s+/u);
  return first;
}

/** Read once, never subscribed: the band only has to be right on arrival. */
const readClockOnce = () => () => {};

/**
 * The server snapshot is a blank title, so no wrong-timezone greeting is shown and corrected on
 * hydration, and the layout never moves.
 */
export function HomeGreeting({ personName }: { personName: string }) {
  const greeting = useSyncExternalStore(
    readClockOnce,
    () => greetingFor(new Date().getHours(), personName),
    () => null,
  );

  return <ChromeTitle>{greeting ?? " "}</ChromeTitle>;
}
