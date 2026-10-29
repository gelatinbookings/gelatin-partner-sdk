import type { Draft } from "./draft";

export type Step = {
  href: string;
  label: string;
  /** Only makes sense with talent picked; a no-lineup event passes over it. */
  talent: boolean;
};

/** The booking steps, in order. Reordering this list is enough to reorder the flow. */
export const STEPS = [
  { href: "/", label: "Date & DJs", talent: false },
  { href: "/event", label: "Event", talent: false },
  { href: "/offer", label: "Offer", talent: true },
  { href: "/bookings", label: "Pay", talent: true },
] as const satisfies readonly Step[];

/** Where a no-lineup event ends: created, nothing sent, nothing charged. */
export const NO_LINEUP_HREF = "/created";

/**
 * The page after `current`. With no lineup chosen the talent steps are passed
 * over, and once none are left the event is created. It reads the draft's
 * flag, not step numbers, so it holds if the steps are reordered.
 */
export function nextStepHref(current: string, draft: Pick<Draft, "noLineup">, steps: readonly Step[] = STEPS): string {
  const index = steps.findIndex((step) => step.href === current);
  const next = steps.slice(index + 1).find((step) => !(draft.noLineup && step.talent));
  return next?.href ?? (draft.noLineup ? NO_LINEUP_HREF : steps[steps.length - 1].href);
}
