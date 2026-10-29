import { describe, expect, it, vi } from "vitest";
import type { DjAlternates } from "@gelatinbookings/partner-sdk/types";
import { alternateHref, draftFromAlternate, isLost, readAlternates, returnedOffer } from "./alternates";
import type { DemoBooking } from "./cookies";

const alternates: DjAlternates = {
  request_id: "req_1", dj_id: "dj_passed", date: "2032-03-11", city: "Billings, MT",
  budget: { currency: "usd", dj_fee_cents: 40000 },
  event: { name: "Synthetic Night", venue_name: "Synthetic Room", venue_address: "1 Synthetic Ave, Billings, MT 59101", starts_at: "2032-03-12T03:00:00Z", ends_at: "2032-03-12T07:00:00Z", time_zone: "America/Denver" },
  items: [{ id: "dj_2", name: "Synthetic Near", city: "Billings, MT", tier: "verified", profile_url: "https://gelatin.example/djs/near", image_url: null, draw: null, published_rate_cents: 45000, available: true }],
};
const booking: DemoBooking = {
  eventId: "event_1", eventName: "Synthetic Night", createdAt: "2032-01-01T00:00:00Z", organizerId: "org_1",
  engagements: [
    { requestId: "req_1", djName: "Passed DJ", totalCents: 46000, currency: "usd" },
    { requestId: "req_2", djName: "Live DJ", totalCents: 46000, currency: "usd" },
  ],
};

describe("isLost", () => {
  it("is true for a pass, an expiry or a cancellation only", () => {
    expect(["declined", "expired", "cancelled"].every((status) => isLost(status as never))).toBe(true);
    expect(isLost("requested")).toBe(false);
    expect(isLost(undefined)).toBe(false);
  });
});

describe("readAlternates", () => {
  it("asks Gelatin only for lost requests, and drops any it can't answer", async () => {
    const gelatin = { listAlternates: vi.fn().mockResolvedValue(alternates) };
    const result = await readAlternates(gelatin, [booking], { req_1: "declined", req_2: "requested" });
    expect(gelatin.listAlternates).toHaveBeenCalledTimes(1);
    expect(gelatin.listAlternates).toHaveBeenCalledWith("event_1", "req_1");
    expect(result).toEqual({ req_1: alternates });
    const failing = { listAlternates: vi.fn().mockRejectedValue(new Error("409")) };
    expect(await readAlternates(failing, [booking], { req_1: "expired" })).toEqual({});
  });
});

describe("draftFromAlternate", () => {
  it("starts a new booking for the chosen DJ with the lost one's night, venue and budget", () => {
    expect(draftFromAlternate(alternates, "dj_2")).toEqual({
      date: "2032-03-11", eventName: "Synthetic Night", venueName: "Synthetic Room",
      venueAddress: "1 Synthetic Ave, Billings, MT 59101", startTime: "20:00", endTime: "00:00", timeZone: "America/Denver",
      email: "", organizerName: "", note: "", selected: [{ id: "dj_2", name: "Synthetic Near", fee: "400" }],
    });
  });

  it("keeps the night when the event's time zone isn't one the demo offers", () => {
    // 21:00–01:00 in Tokyo is 07:00–11:00 in New York, still on standard time (UTC−5) on 11 March 2032.
    const tokyo = { ...alternates, event: { ...alternates.event, time_zone: "Asia/Tokyo", starts_at: "2032-03-11T21:00:00+09:00", ends_at: "2032-03-12T01:00:00+09:00" } };
    expect(draftFromAlternate(tokyo, "dj_2")).toMatchObject({ timeZone: "America/New_York", startTime: "07:00", endTime: "11:00", date: "2032-03-11" });
  });

  it("refuses a DJ who isn't in the list", () => {
    expect(draftFromAlternate(alternates, "dj_passed")).toBeNull();
  });
});

describe("links", () => {
  it("builds the demo's own Offer link", () => {
    expect(alternateHref("event 1", "req_1", "dj_2")).toBe("/alternate?event=event+1&request=req_1&dj=dj_2");
  });

  it("reads Gelatin's Offer return only for a request in this browser's bookings", () => {
    const params = { gelatin_request_id: "req_1", gelatin_offer_dj: "dj_2" };
    expect(returnedOffer(params, [booking])).toBe("/alternate?event=event_1&request=req_1&dj=dj_2");
    expect(returnedOffer({ ...params, gelatin_request_id: "someone-else" }, [booking])).toBeNull();
    expect(returnedOffer({ gelatin_request_id: "req_1" }, [booking])).toBeNull();
    expect(returnedOffer({ ...params, gelatin_offer_dj: ["a", "b"] }, [booking])).toBeNull();
  });
});
