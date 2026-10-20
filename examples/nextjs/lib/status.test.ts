import { describe, expect, it, vi } from "vitest";
import { describeStatus, readRequestStatuses, shouldPoll } from "./status";
import type { DemoBooking } from "./cookies";

const booking = (eventId: string, requestIds: string[]): DemoBooking => ({
  eventId,
  eventName: "Friday Social",
  createdAt: "2026-10-19T17:00:00Z",
  organizerId: "user_1",
  engagements: requestIds.map((requestId) => ({ requestId, djName: "DJ", totalCents: 31648, currency: "usd" })),
});

const projection = (eventId: string, requests: Array<{ request_id: string; status: string }>) => ({
  modified: true as const,
  etag: null,
  data: {
    external_event_id: eventId,
    revision: 1,
    bookings: [{
      partner_booking_id: "pb_1",
      external_booking_id: "b_1",
      requests: requests.map((request) => ({
        external_request_id: `ext_${request.request_id}`,
        request_id: request.request_id,
        dj_id: "dj_1",
        status: request.status,
        offer_revision: 1,
        amount: null,
        actions: [],
      })),
    }],
  },
});

describe("demo booking status", () => {
  it("reads each event once and maps Gelatin's status onto each request", async () => {
    const getEventBookings = vi.fn(async (eventId: string) => eventId === "e1"
      ? projection("e1", [{ request_id: "r1", status: "requested" }, { request_id: "r2", status: "authorization_required" }])
      : projection("e2", [{ request_id: "r3", status: "confirmed" }]));
    const statuses = await readRequestStatuses({ getEventBookings }, [booking("e1", ["r1", "r2"]), booking("e2", ["r3"])]);
    expect(getEventBookings).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual({ r1: "requested", r2: "authorization_required", r3: "confirmed" });
  });

  it("leaves a request unknown when Gelatin can't be read, without failing the page", async () => {
    const getEventBookings = vi.fn(async (eventId: string) => {
      if (eventId === "e1") throw new Error("unavailable");
      return projection("e2", [{ request_id: "r3", status: "declined" }]);
    });
    const statuses = await readRequestStatuses({ getEventBookings }, [booking("e1", ["r1"]), booking("e2", ["r3"])]);
    expect(statuses).toEqual({ r3: "declined" });
  });

  it("offers the managed Gelatin booking page once a request is with the DJ or booked", () => {
    for (const status of ["requested", "negotiating", "confirmed"] as const) expect(describeStatus(status).manage, status).toBe(true);
    for (const status of ["authorization_required", "reauthorization_required", "declined", "expired", "cancelled"] as const) expect(describeStatus(status).manage, status).toBe(false);
  });

  it("keeps reading status only while a DJ still has to answer", () => {
    expect(shouldPoll({ a: "requested" })).toBe(true);
    expect(shouldPoll({ a: "confirmed", b: "negotiating" })).toBe(true);
    // Nothing changes on Gelatin's side until the organizer acts, or it is final.
    expect(shouldPoll({ a: "authorization_required", b: "confirmed", c: "declined" })).toBe(false);
    expect(shouldPoll({})).toBe(false);
  });

  it("offers an action only when the organizer has something to do, or the status is unknown", () => {
    // The first hold is paid on this page; a DJ's new offer is reviewed in Gelatin.
    expect(describeStatus("authorization_required")).toMatchObject({ action: "Pay now", via: "page" });
    expect(describeStatus("reauthorization_required")).toMatchObject({ action: "Review the new offer in Gelatin", via: "gelatin" });
    expect(describeStatus(undefined)).toMatchObject({ label: null, action: "Review and pay in Gelatin", via: "gelatin" });
    for (const status of ["requested", "negotiating", "confirmed", "declined", "expired", "cancelled"] as const) {
      expect(describeStatus(status).action, status).toBeNull();
      expect(describeStatus(status).label, status).toBeTruthy();
    }
  });
});
