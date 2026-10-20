import { describe, expect, it } from "vitest";
import { buildSubmission, demoBookingFormSchema, organizerIdFor } from "./submission";
import { eventInterval, zonedIso } from "./time";

const form = demoBookingFormSchema.parse({
  nonce: "0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10",
  event_name: "Community Friday",
  venue_name: "The Loft",
  venue_address: "12 Example St, Atlanta, GA 30309",
  date: "2030-11-15",
  start_time: "21:00",
  end_time: "01:00",
  time_zone: "America/New_York",
  organizer_email: "Organizer@Example.test",
  organizer_name: "Taylor",
  djs: [
    { id: "22222222-2222-4222-8222-222222222222", name: "DJ One", fee_dollars: 450 },
    { id: "33333333-3333-4333-8333-333333333333", name: "DJ Two", fee_dollars: 300 },
  ],
});

describe("demo booking packet", () => {
  it("sends the venue's address so Gelatin can show the DJ where to go", () => {
    expect(buildSubmission(form, "https://partner-demo.staging.gelatinbookings.com").submission.event.venue_address).toBe("12 Example St, Atlanta, GA 30309");
    const { venue_address: _omitted, ...withoutAddress } = demoBookingFormSchema.parse(form);
    expect(demoBookingFormSchema.safeParse(withoutAddress).success).toBe(false);
  });

  it("converts local wall-clock times to offset timestamps across daylight-saving rules", () => {
    expect(zonedIso("2030-07-04", "20:00", "America/New_York")).toBe("2030-07-04T20:00:00-04:00");
    expect(zonedIso("2030-01-04", "20:00", "America/New_York")).toBe("2030-01-04T20:00:00-05:00");
    expect(zonedIso("2030-07-04", "20:00", "Europe/London")).toBe("2030-07-04T20:00:00+01:00");
    expect(() => zonedIso("2030-03-10", "02:30", "America/New_York")).toThrow("does not exist");
  });

  it("puts an end time at or before the start on the next day", () => {
    expect(eventInterval("2030-12-31", "22:00", "02:00", "America/Chicago")).toEqual({
      starts_at: "2030-12-31T22:00:00-06:00", ends_at: "2031-01-01T02:00:00-06:00",
    });
  });

  it("derives every external ID from the form nonce, so a double submit reuses one booking ID", () => {
    const first = buildSubmission(form, "https://partner-demo.staging.gelatinbookings.com");
    const again = buildSubmission(form, "https://partner-demo.staging.gelatinbookings.com");
    expect(again).toEqual(first);
    expect(first.submission.external_booking_id).toBe("demo-bkg-0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10");
    expect(first.submission.external_event_id).toBe("demo-evt-0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10");
    expect(first.submission.requests.map((item) => item.external_request_id)).toEqual([
      "demo-req-0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10-1", "demo-req-0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10-2",
    ]);
    expect(first.submission.requests[0].initial_offer).toEqual({ currency: "usd", dj_fee_cents: 45_000 });
    expect(first.submission.authorization_placement).toBe("partner_event_flow");
    expect(first.submission.return_url).toBe("https://partner-demo.staging.gelatinbookings.com/return?event=demo-evt-0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10");
  });

  it("uses one organizer ID per email, case-insensitively", () => {
    const built = buildSubmission(form, "https://partner-demo.staging.gelatinbookings.com");
    expect(built.submission.organizer.external_user_id).toBe(organizerIdFor("organizer@example.test"));
    expect(organizerIdFor("a@example.test")).not.toBe(organizerIdFor("b@example.test"));
  });

  it("refuses past events, duplicate DJs, unknown fields and more than five DJs", () => {
    expect(() => buildSubmission({ ...form, date: "2020-01-01" }, "https://partner-demo.staging.gelatinbookings.com")).toThrow("future");
    expect(() => buildSubmission({ ...form, djs: [form.djs[0], { ...form.djs[0], id: form.djs[0].id.toUpperCase() }] }, "https://partner-demo.staging.gelatinbookings.com")).toThrow("once");
    expect(demoBookingFormSchema.safeParse({ ...form, total_cents: 1 }).success).toBe(false);
    const six = Array.from({ length: 6 }, (_, index) => ({ id: `2222222${index}-2222-4222-8222-222222222222`, name: `DJ ${index}`, fee_dollars: 100 }));
    expect(demoBookingFormSchema.safeParse({ ...form, djs: six }).success).toBe(false);
    expect(demoBookingFormSchema.safeParse({ ...form, time_zone: "Mars/Olympus" }).success).toBe(false);
  });
});
