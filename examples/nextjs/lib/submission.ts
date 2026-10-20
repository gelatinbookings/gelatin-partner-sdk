import { createHash } from "node:crypto";
import { z } from "zod";
import type { DjRequestSubmission } from "@gelatinbookings/partner-sdk/types";
import { DEMO_TIME_ZONES, eventInterval } from "./time";

/** The demo caps one booking at five DJs so its cookie record stays small. */
export const MAX_DEMO_DJS = 5;

const text = (max: number) => z.string().trim().min(1).max(max);

export const demoBookingFormSchema = z.strictObject({
  nonce: z.uuid(),
  event_name: text(120),
  venue_name: text(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  time_zone: z.enum(DEMO_TIME_ZONES),
  organizer_email: z.email().max(254),
  organizer_name: text(80),
  note: z.string().trim().max(600).optional(),
  djs: z.array(z.strictObject({
    id: z.uuid(),
    name: text(80),
    // Whole dollars keep the demo form simple; Gelatin computes every fee and total.
    fee_dollars: z.number().int().min(50).max(20_000),
  })).min(1).max(MAX_DEMO_DJS),
});

export type DemoBookingForm = z.infer<typeof demoBookingFormSchema>;

/** Stable per organizer email, because Gelatin keeps the first email it sees for an organizer ID. */
export function organizerIdFor(email: string) {
  return `demo-organizer-${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

/**
 * Build the Gelatin packet. Every external ID derives from the form's nonce,
 * so a double submit is the same logical write: the SDK's default
 * idempotency key is `booking:<external_booking_id>`.
 */
export function buildSubmission(form: DemoBookingForm, publicOrigin: string): {
  submission: DjRequestSubmission;
} {
  const interval = eventInterval(form.date, form.start_time, form.end_time, form.time_zone);
  if (Date.parse(interval.starts_at) <= Date.now()) throw new Error("The event must be in the future");
  const ids = new Set(form.djs.map((dj) => dj.id.toLowerCase()));
  if (ids.size !== form.djs.length) throw new Error("Each DJ can be requested once");

  const eventId = `demo-evt-${form.nonce}`;
  const returnUrl = new URL("/return", publicOrigin);
  returnUrl.searchParams.set("event", eventId);
  return {
    submission: {
      external_event_id: eventId,
      external_submission_id: `demo-sub-${form.nonce}`,
      external_booking_id: `demo-bkg-${form.nonce}`,
      organizer: {
        external_user_id: organizerIdFor(form.organizer_email),
        email: form.organizer_email.trim(),
        display_name: form.organizer_name,
      },
      event: { name: form.event_name, ...interval, time_zone: form.time_zone, venue_name: form.venue_name },
      requests: form.djs.map((dj, index) => ({
        external_request_id: `demo-req-${form.nonce}-${index + 1}`,
        dj_id: dj.id,
        initial_offer: { currency: "usd", dj_fee_cents: dj.fee_dollars * 100, ...(form.note ? { note: form.note } : {}) },
      })),
      authorization_placement: "gelatin_portal_handoff",
      return_url: returnUrl.toString(),
    },
  };
}
