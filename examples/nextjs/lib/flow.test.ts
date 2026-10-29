import { describe, expect, it } from "vitest";
import { NO_LINEUP_HREF, nextStepHref, STEPS, type Step } from "./flow";

const picked = { noLineup: false };
const skipped = { noLineup: true };

describe("nextStepHref", () => {
  it("walks every step in order when DJs are picked", () => {
    expect(nextStepHref("/", picked)).toBe("/event");
    expect(nextStepHref("/event", picked)).toBe("/offer");
    expect(nextStepHref("/offer", picked)).toBe("/bookings");
  });

  it("treats a draft saved before the flag existed as picked", () => {
    expect(nextStepHref("/event", {})).toBe("/offer");
  });

  it("passes over the offer and pay steps with no lineup, ending on the created page", () => {
    expect(nextStepHref("/", skipped)).toBe("/event");
    expect(nextStepHref("/event", skipped)).toBe(NO_LINEUP_HREF);
    expect(STEPS.filter((step) => step.talent).map((step) => step.href)).toEqual(["/offer", "/bookings"]);
  });

  it("follows the flag, not the step order, when the steps are reordered", () => {
    const eventFirst: Step[] = [
      { href: "/event", label: "Event", talent: false },
      { href: "/", label: "Date & DJs", talent: false },
      { href: "/offer", label: "Offer", talent: true },
      { href: "/bookings", label: "Pay", talent: true },
    ];
    expect(nextStepHref("/event", skipped, eventFirst)).toBe("/");
    expect(nextStepHref("/", skipped, eventFirst)).toBe(NO_LINEUP_HREF);
    expect(nextStepHref("/", picked, eventFirst)).toBe("/offer");
  });
});
