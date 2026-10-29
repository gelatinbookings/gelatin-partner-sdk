import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "../../../lib/page-session";
import { describeGelatinError, gelatinClient } from "../../../lib/gelatin";
import { eventWhen, toPublicLineup, type PublicLineupRow } from "../../../lib/public-event";

export const dynamic = "force-dynamic";

/**
 * A mock of this partner's public event page, as attendees would see it:
 * event details, then the lineup from Gelatin, then about. The lineup is
 * read fresh and shows confirmed DJs only, each linking to the profile
 * Gelatin gave. Event details are this site's own; Gelatin doesn't serve them.
 */
export default async function PublicEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { config, bookings } = await requirePageSession();
  const { eventId } = await params;
  const booking = bookings.find((item) => item.eventId === eventId);
  if (!booking) notFound();

  let lineup: PublicLineupRow[] | null = null;
  let failure: string | null = null;
  try {
    const result = await gelatinClient(config).getEventLineup(booking.eventId);
    lineup = result.modified ? toPublicLineup(result.data) : [];
  } catch (error) {
    failure = describeGelatinError(error).status === 404 ? null : "The lineup can't be loaded right now. Check back shortly.";
    if (!failure) lineup = [];
  }
  const when = booking.event ? eventWhen(booking.event) : null;

  return (
    <div className="public-event">
      <div className="public-event-bar">
        <span className="eyebrow">Public event page · what attendees see</span>
        <Link href={`/bookings?event=${encodeURIComponent(booking.eventId)}`}>Back to bookings</Link>
      </div>
      <article className="public-event-card" aria-labelledby="public-event-title">
        <h1 id="public-event-title">{booking.eventName}</h1>

        <section aria-labelledby="public-event-details">
          <h2 id="public-event-details">Event details</h2>
          {booking.event ? (
            <dl className="public-event-details">
              <div><dt>Date</dt><dd>{when?.date}</dd></div>
              <div><dt>Time</dt><dd>{when?.time}</dd></div>
              <div>
                <dt>Location</dt>
                <dd>{booking.event.venueName}{booking.event.venueAddress && <small>{booking.event.venueAddress}</small>}</dd>
              </div>
            </dl>
          ) : (
            <p className="public-event-muted">This event was created before this page kept its details.</p>
          )}
        </section>

        <section aria-labelledby="public-event-lineup">
          <h2 id="public-event-lineup">Lineup</h2>
          <div className="public-lineup">
            {failure ? (
              <p className="public-event-muted" role="status">{failure}</p>
            ) : lineup && lineup.length > 0 ? (
              <ol>
                {lineup.map((dj) => {
                  const body = (
                    <>
                      {dj.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element -- Gelatin-hosted image, sized by CSS.
                        ? <img className="public-lineup-avatar" src={dj.imageUrl} alt="" width={36} height={36} loading="lazy" />
                        : <span className="public-lineup-avatar" aria-hidden="true">{dj.initials}</span>}
                      <span className="public-lineup-name">{dj.name}</span>
                      {dj.profileUrl && <span className="public-lineup-go" aria-hidden="true">›</span>}
                    </>
                  );
                  return (
                    <li key={dj.id}>
                      {dj.profileUrl
                        ? <a href={dj.profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`${dj.name}, DJ profile (opens in a new tab)`}>{body}</a>
                        : <span>{body}</span>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="public-event-muted">The DJ lineup will show up here once bookings are confirmed. Check back later.</p>
            )}
            <p className="public-lineup-attrib"><i aria-hidden="true" /> Powered by <b>Gelatin</b></p>
          </div>
        </section>

        <section aria-labelledby="public-event-about">
          <h2 id="public-event-about">About this event</h2>
          <p className="public-event-muted">A demo event created on Example Nights with synthetic details.</p>
        </section>
      </article>
    </div>
  );
}
