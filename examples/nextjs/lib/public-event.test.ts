import { describe, expect, it } from "vitest";
import type { EventLineup } from "@gelatinbookings/partner-sdk/types";
import { eventWhen, toPublicLineup } from "./public-event";

const lineup = (entries: EventLineup["entries"]): EventLineup => ({ external_event_id: "demo-evt-1", entries });
const entry = (overrides: Partial<EventLineup["entries"][number]> = {}): EventLineup["entries"][number] => ({
  dj_id: "dj-1", name: "Synthetic DJ Verified", status: "confirmed",
  profile_url: "https://book-demo.example/partner/djs/synthetic-verified", image_url: "https://images.example/dj.jpg", ...overrides,
});

describe("toPublicLineup", () => {
  it("shows confirmed DJs only, with initials and Gelatin's profile link", () => {
    expect(toPublicLineup(lineup([entry(), entry({ dj_id: "dj-2", name: "Pending DJ", status: "pending" })]))).toEqual([
      { id: "dj-1", name: "Synthetic DJ Verified", initials: "SD", profileUrl: "https://book-demo.example/partner/djs/synthetic-verified", imageUrl: "https://images.example/dj.jpg" },
    ]);
  });

  it("keeps only https links and images from Gelatin", () => {
    const [row] = toPublicLineup(lineup([entry({ profile_url: "javascript:alert(1)", image_url: "http://insecure.example/dj.jpg" })]));
    expect(row).toMatchObject({ profileUrl: null, imageUrl: null });
  });

  it("is empty for an event with no confirmed DJ", () => {
    expect(toPublicLineup(lineup([]))).toEqual([]);
  });
});

describe("eventWhen", () => {
  it("formats the night in the event's own time zone, across midnight", () => {
    expect(eventWhen({ startsAt: "2026-11-14T22:00:00-05:00", endsAt: "2026-11-15T02:00:00-05:00", timeZone: "America/New_York" }))
      .toEqual({ date: "Sat, Nov 14, 2026", time: "10:00 PM – 2:00 AM EST" });
  });

  it("uses the event's zone, not the server's", () => {
    expect(eventWhen({ startsAt: "2026-07-04T20:00:00-07:00", endsAt: "2026-07-04T23:30:00-07:00", timeZone: "America/Los_Angeles" }))
      .toEqual({ date: "Sat, Jul 4, 2026", time: "8:00 PM – 11:30 PM PDT" });
  });
});
