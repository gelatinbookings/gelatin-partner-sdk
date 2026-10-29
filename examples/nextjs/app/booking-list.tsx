import Link from "next/link";
import type { DjAlternates, PartnerBookingStatus } from "@gelatinbookings/partner-sdk/types";
import { alternateHref } from "../lib/alternates";
import { toCatalogDj } from "../lib/catalog-view";
import type { DemoBooking } from "../lib/cookies";
import { describeStatus } from "../lib/status";
import LaunchButton from "./launch-button";
import PayButton from "./pay-button";
import { longDate } from "./steps";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

/** Who else is open for a lost DJ's slot, in its place in the list. Offer starts a new booking, pre-filled. */
function Alternates({ eventId, alternates }: { eventId: string; alternates: DjAlternates }) {
  const where = alternates.city ? ` in ${alternates.city}` : "";
  return (
    <div className="alternates" aria-label="Other DJs open that night">
      <p className="alternates-head">Open on {longDate(alternates.date)}{where} <span className="gel">· same budget, from Gelatin</span></p>
      {alternates.items.length === 0 ? (
        <p className="hint">No one else{where} is free that night at this budget yet. <Link href="/">Search another date</Link></p>
      ) : (
        <ul className="alternates-list">
          {alternates.items.map((item) => {
            const dj = toCatalogDj(item);
            return (
              <li key={dj.id} className="alternate-row">
                <span className="avatar" aria-hidden="true">{dj.initials}</span>
                <span className="dj-copy">
                  <strong>{dj.name}</strong>
                  <small>
                    {dj.tier} · {dj.drawLabel} · {dj.rateDollars !== null ? `from $${dj.rateDollars.toLocaleString()}` : "rate on request"}
                    {dj.profileUrl && <> · <a href={dj.profileUrl} target="_blank" rel="noreferrer noopener">Profile</a></>}
                  </small>
                </span>
                <Link className="button-secondary button-small" href={alternateHref(eventId, alternates.request_id, dj.id)} aria-label={`Offer ${dj.name}`}>Offer</Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function BookingList({ bookings, highlight, statuses = {}, alternates = {}, light = false }: {
  bookings: DemoBooking[];
  highlight: string | null;
  statuses?: Record<string, PartnerBookingStatus>;
  /** Gelatin's alternates for each lost request, by request ID. */
  alternates?: Record<string, DjAlternates>;
  /** Light (GEL-917): one "Manage in Gelatin" per DJ, and no public event page. */
  light?: boolean;
}) {
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
            <span className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
              <span className="mono">{booking.eventId}</span>
              {!light && <Link href={`/events/${encodeURIComponent(booking.eventId)}`}>Public event page</Link>}
            </span>
          </div>
          {booking.engagements.map((engagement) => (
            <div key={engagement.requestId}>
            <div className="engagement">
              <span className="dj-copy">
                <strong>{engagement.djName}</strong>
                <small>Organizer total <span className="gel">{money(engagement.totalCents, engagement.currency)}</span></small>
                <span className="mono">Request {engagement.requestId}</span>
              </span>
              {(() => {
                const status = describeStatus(statuses[engagement.requestId]);
                return (
                  <span className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                    {status.label && <span className={`tag${status.tone === "ok" ? " tag-ok" : status.tone === "no" ? " tag-no" : ""}`}>{status.label}</span>}
                    {light && <LaunchButton eventId={booking.eventId} requestId={engagement.requestId} djName={engagement.djName} label="Manage in Gelatin" />}
                    {!light && status.via === "page" && <PayButton eventId={booking.eventId} requestId={engagement.requestId} djName={engagement.djName} />}
                    {!light && status.via === "gelatin" && status.action && <LaunchButton eventId={booking.eventId} requestId={engagement.requestId} djName={engagement.djName} label={status.action} />}
                    {!light && status.manage && <LaunchButton eventId={booking.eventId} requestId={engagement.requestId} djName={engagement.djName} label="Manage in Gelatin" secondary />}
                  </span>
                );
              })()}
            </div>
            {alternates[engagement.requestId] && <Alternates eventId={booking.eventId} alternates={alternates[engagement.requestId]} />}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
