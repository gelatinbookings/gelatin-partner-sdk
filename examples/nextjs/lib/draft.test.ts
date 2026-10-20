import { describe, expect, it } from "vitest";
import { demoBookingFormSchema } from "./submission";
import { eventComplete, freshDraft, hasDjs, MAX_DRAFT_DJS, submissionBody, toggleDj, withAvailabilityDate, type Draft } from "./draft";

const NONCE = "0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10";
const DJ = { id: "22222222-2222-4222-8222-222222222222", name: "DJ One", available: true, rateDollars: 300 };

function ready(): Draft {
  return {
    ...freshDraft(NONCE), date: "2031-11-13", eventName: "Community Friday", venueName: "The Room",
    email: "organizer@example.test", organizerName: "Sam Rivera",
    selected: [{ id: DJ.id, name: DJ.name, fee: "300" }],
  };
}

describe("booking draft", () => {
  it("takes the booking date from the night availability was read for, and drops picks when it changes", () => {
    const first = withAvailabilityDate(freshDraft(NONCE), "2031-11-13");
    expect(first).toEqual({ draft: expect.objectContaining({ date: "2031-11-13" }), cleared: false });
    const picked = toggleDj(first.draft, DJ).draft;
    expect(withAvailabilityDate(picked, "2031-11-13")).toEqual({ draft: picked, cleared: false });
    const moved = withAvailabilityDate(picked, "2031-11-20");
    expect(moved.cleared).toBe(true);
    expect(moved.draft).toMatchObject({ date: "2031-11-20", selected: [] });
  });

  it("adds only DJs reported free on that date, up to the cap, and removes on a second click", () => {
    const draft = withAvailabilityDate(freshDraft(NONCE), "2031-11-13").draft;
    expect(toggleDj(draft, { ...DJ, available: false })).toMatchObject({ draft, error: expect.stringContaining("isn't available") });
    expect(toggleDj(draft, { ...DJ, available: null }).error).toBeTruthy();
    const added = toggleDj(draft, DJ).draft;
    expect(added.selected).toEqual([{ id: DJ.id, name: "DJ One", fee: "300" }]);
    expect(toggleDj(added, DJ).draft.selected).toEqual([]);
    let full = draft;
    for (let i = 0; i < MAX_DRAFT_DJS; i++) full = toggleDj(full, { ...DJ, id: `${i}${DJ.id.slice(1)}` }).draft;
    expect(toggleDj(full, { ...DJ, id: "9".repeat(8) + DJ.id.slice(8) }).error).toContain(`at most ${MAX_DRAFT_DJS}`);
  });

  it("knows when each step is done", () => {
    expect(hasDjs(freshDraft(NONCE))).toBe(false);
    expect(hasDjs(ready())).toBe(true);
    expect(eventComplete(ready())).toBe(true);
    expect(eventComplete({ ...ready(), email: "not-an-email" })).toBe(false);
    expect(eventComplete({ ...ready(), venueName: " " })).toBe(false);
  });

  it("builds a body the demo server accepts, with the step 1 date", () => {
    const result = submissionBody({ ...ready(), note: "Two-hour set" });
    expect("body" in result && result.body.date).toBe("2031-11-13");
    if (!("body" in result)) throw new Error(result.error);
    expect(demoBookingFormSchema.safeParse(result.body).success).toBe(true);
  });

  it("names the first thing to fix instead of sending", () => {
    expect(submissionBody(freshDraft(NONCE))).toEqual({ error: "Choose a date and at least one DJ." });
    expect(submissionBody({ ...ready(), eventName: "" })).toEqual({ error: "Fill in the event details." });
    expect(submissionBody({ ...ready(), selected: [{ id: DJ.id, name: DJ.name, fee: "20" }] })).toEqual({ error: expect.stringContaining("between $50") });
  });
});
