/**
 * The re-share consent rule: only the user can re-share a page the user unshared. Pure, so the
 * write path and its test share the code.
 */

/** The exposure columns the rule reads. */
export interface ExposureState {
  shared: boolean;
  exposureActor: string | null;
  exposureUpdatedAt?: Date | null;
}

export interface ReshareAttempt {
  shared?: boolean;
  actor: "agent" | "user";
}

/** True when an agent is re-sharing a page the user unshared. */
export function reshareNeedsUser(page: ExposureState, attempt: ReshareAttempt): boolean {
  return (
    attempt.shared === true
    && attempt.actor === "agent"
    && page.shared === false
    && page.exposureActor === "user"
  );
}

/**
 * The exposure column patch for a write, or null when `shared` does not change. A move keeps
 * `exposureActor` so it cannot launder a user's unshare past `reshareNeedsUser`.
 */
export function exposureUpdate(args: {
  moved: boolean;
  requestedShared: boolean | undefined;
  page: { shared: boolean };
  actor: "agent" | "user" | "system";
  now: Date;
}): { shared: boolean; sharedAt: Date | null; exposureActor: "agent" | "user" | "system"; exposureUpdatedAt: Date } | null {
  const nextShared = args.moved ? false : (args.requestedShared ?? args.page.shared);
  if (nextShared === args.page.shared) return null;
  return {
    shared: nextShared,
    sharedAt: nextShared ? args.now : null,
    exposureActor: args.actor,
    exposureUpdatedAt: args.now,
  };
}
