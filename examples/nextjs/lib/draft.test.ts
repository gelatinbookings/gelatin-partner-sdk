import { describe, expect, it } from "vitest";
import { demoBookingFormSchema } from "./submission";
import {
  addTalentLater, createdWithoutLineup, eventComplete, freshDraft, hasDjs, lineupChosen, MAX_DRAFT_DJS, picksToCheck, removeDjs, skipLineup,
  submissionBody, takenDjs, toggleDj, withAvailabilityDate, type Draft,
} from "./draft";

const NONCE = "0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10";
const DJ = { id: "22222222-2222-4222-8222-222222222222", name: "DJ One", available: true, rateDollars: 300 };

function ready(): Draft {
  return {
    ...freshDraft(NONCE), date: "2031-11-13", eventName: "Community Friday", venueName: "The Room", venueAddress: "12 Example St, Atlanta, GA",
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
    expect(eventComplete({ ...ready(), venueAddress: "" })).toBe(false);
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

  it("lists only the picked DJs Gelatin flagged as taken, in pick order, and nobody when all are free", () => {
    const two = { ...ready(), selected: [...ready().selected, { id: "33333333-3333-4333-8333-333333333333", name: "DJ Two", fee: "400" }] };
    expect(takenDjs(two, [])).toEqual([]);
    expect(takenDjs(two, ["33333333-3333-4333-8333-333333333333", "99999999-9999-4999-8999-999999999999"])).toEqual([two.selected[1]]);
    expect(takenDjs(two, [DJ.id.toUpperCase()])).toEqual([two.selected[0]]);
  });

  it("removes a taken DJ and keeps the rest of the booking", () => {
    const two = { ...ready(), selected: [...ready().selected, { id: "33333333-3333-4333-8333-333333333333", name: "DJ Two", fee: "400" }] };
    const result = removeDjs(two, ["33333333-3333-4333-8333-333333333333"]);
    expect(result.selected).toEqual([two.selected[0]]);
    expect(result).toEqual({ ...two, selected: [two.selected[0]] });
    expect(hasDjs(removeDjs(two, two.selected.map((item) => item.id)))).toBe(false);
  });
});

describe("skip, no lineup right now", () => {
  it("still needs a date and at least one DJ when the lineup is not skipped", () => {
    const dated = withAvailabilityDate(freshDraft(NONCE), "2031-11-13").draft;
    expect(lineupChosen(dated)).toBe(false);
    expect(lineupChosen(toggleDj(dated, DJ).draft)).toBe(true);
    expect(lineupChosen({ ...ready(), selected: [] })).toBe(false);
    expect(createdWithoutLineup(ready())).toBe(false);
    expect(createdWithoutLineup({ ...ready(), selected: [] })).toBe(false);
  });

  it("answers the lineup question with no DJs, dropping any picks", () => {
    const skipped = skipLineup(ready());
    expect(skipped).toMatchObject({ noLineup: true, selected: [], eventName: "Community Friday" });
    expect(lineupChosen(skipped)).toBe(true);
    expect(hasDjs(skipped)).toBe(false);
    expect(createdWithoutLineup(skipped)).toBe(true);
  });

  it("still needs the night and the event details before the event is created", () => {
    expect(lineupChosen(skipLineup(freshDraft(NONCE)))).toBe(false);
    expect(createdWithoutLineup(skipLineup({ ...ready(), venueName: "" }))).toBe(false);
  });

  it("never re-checks availability for a no-lineup event", () => {
    expect(picksToCheck(ready())).toBe(true);
    expect(picksToCheck(skipLineup(ready()))).toBe(false);
    // Even a hand-edited draft that kept picks while skipping is not checked.
    expect(picksToCheck({ ...ready(), noLineup: true })).toBe(false);
  });

  it("sends nothing to Gelatin for a no-lineup event", () => {
    expect(submissionBody(skipLineup(ready()))).toEqual({ error: "Choose a date and at least one DJ." });
  });

  it("goes back to picking talent when a DJ is added or the organizer adds talent later", () => {
    const skipped = skipLineup(ready());
    const picked = toggleDj(skipped, DJ).draft;
    expect(picked.noLineup).toBe(false);
    expect(createdWithoutLineup(picked)).toBe(false);
    const later = addTalentLater(skipped);
    expect(later).toMatchObject({ noLineup: false, eventName: "Community Friday", date: "2031-11-13" });
    expect(lineupChosen(later)).toBe(false);
  });

  it("keeps the choice when the night changes, and treats drafts saved before the flag as not skipped", () => {
    expect(withAvailabilityDate(skipLineup(ready()), "2031-11-20").draft).toMatchObject({ noLineup: true, date: "2031-11-20" });
    const older: Draft = { ...ready(), selected: [] };
    delete older.noLineup;
    expect(lineupChosen(older)).toBe(false);
    expect(freshDraft(NONCE).noLineup).toBe(false);
  });
});
