import Link from "next/link";
import type { DjAlternates } from "@gelatinbookings/partner-sdk/types";
import { draftFromAlternate } from "../../lib/alternates";
import type { Draft } from "../../lib/draft";
import { describeGelatinError, gelatinClient } from "../../lib/gelatin";
import { requirePageSession } from "../../lib/page-session";
import AlternateStart from "./alternate-start";

export const dynamic = "force-dynamic";

/**
 * Offer on an alternate: start a new booking for that DJ with the lost
 * booking's night, venue and budget. Only a request this browser sent is
 * followed, and Gelatin is asked again so the DJ is still open that night.
 */
export default async function AlternatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { config, bookings } = await requirePageSession();
  const params = await searchParams;
  const [eventId, requestId, djId] = [params.event, params.request, params.dj].map((value) => (typeof value === "string" ? value : null));
  const booking = bookings.find((item) => item.eventId === eventId && item.engagements.some((engagement) => engagement.requestId === requestId));

  let message: string | null = null;
  let template: Omit<Draft, "nonce"> | null = null;
  if (!booking || !eventId || !requestId || !djId) {
    message = "That booking is not in this browser's list.";
  } else {
    let alternates: DjAlternates | null = null;
    try {
      alternates = await gelatinClient(config).listAlternates(eventId, requestId);
    } catch (error) {
      message = describeGelatinError(error).message;
    }
    template = alternates && draftFromAlternate(alternates, djId);
    if (alternates && !template) message = "That DJ is no longer open that night. Pick another from your bookings.";
  }

  return (
    <main className="main main-narrow">
      <div className="heading">
        <div>
          <h1>New offer</h1>
          <p className="subtle">The night, venue and budget come from the booking the last DJ couldn&apos;t take. You can change anything before you send it.</p>
        </div>
      </div>
      {template ? (
        <AlternateStart draft={template} />
      ) : (
        <div className="stack">
          <p className="notice notice-error" role="alert">{message}</p>
          <Link className="button-secondary" href="/bookings">Back to bookings</Link>
        </div>
      )}
    </main>
  );
}
