import Link from "next/link";
import type { DemoBooking } from "../lib/cookies";
import { describeStatus } from "../lib/status";
import type { PartnerBookingStatus } from "@gelatinbookings/partner-sdk/types";
import LaunchButton from "./launch-button";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default function BookingList({ bookings, highlight, statuses = {} }: { bookings: DemoBooking[]; highlight: string | null; statuses?: Record<string, PartnerBookingStatus> }) {
  if (bookings.length === 0) {
    return (
      <section className="panel">
        <div className="empty stack" style={{ alignItems: "center" }}>
          <p>No bookings from this browser yet.</p>
          <Link className="button-secondary" href="/">Find DJs</Link>
        </div>
      </section>
    );
  }
  return (
    <section className="panel" aria-label="Bookings sent to Gelatin">
      {bookings.map((booking) => (
        <article key={booking.eventId} className="booking" data-highlight={booking.eventId === highlight}>
          <div className="booking-head">
            <h3>{booking.eventName}</h3>
            <span className="mono">{booking.eventId}</span>
          </div>
          {booking.engagements.map((engagement) => (
            <div key={engagement.requestId} className="engagement">
              <span className="dj-copy">
                <strong>{engagement.djName}</strong>
                <small>Organizer total {money(engagement.totalCents, engagement.currency)}</small>
                <span className="mono">Request {engagement.requestId}</span>
              </span>
              {(() => {
                const status = describeStatus(statuses[engagement.requestId]);
                return (
                  <span className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                    {status.label && <span className={`tag${status.tone === "ok" ? " tag-ok" : status.tone === "no" ? " tag-no" : ""}`}>{status.label}</span>}
                    {status.action && <LaunchButton eventId={booking.eventId} requestId={engagement.requestId} djName={engagement.djName} label={status.action} />}
                  </span>
                );
              })()}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
