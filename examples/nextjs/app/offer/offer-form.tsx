"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventComplete, hasDjs, removeDjs, submissionBody, takenDjs } from "../../lib/draft";
import { EmbeddedCheckout } from "../pay-button";
import { longDate } from "../steps";
import { TakenNotice } from "../taken-notice";
import { useDraft } from "../use-draft";
import { usePickedAvailability } from "../use-picked-availability";

/** One checkout for every DJ, returned with the booking (Full, with saved cards on). */
type EventCheckout = { session: { clientSecret: string; publishableKey: string }; next: string; totalCents: number; currency: string; djCount: number };

function readCheckout(value: unknown, next: string): EventCheckout | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.client_secret !== "string" || typeof row.publishable_key !== "string" || typeof row.total_cents !== "number"
    || typeof row.currency !== "string" || typeof row.dj_count !== "number") return null;
  return { session: { clientSecret: row.client_secret, publishableKey: row.publishable_key }, next, totalCents: row.total_cents, currency: row.currency, djCount: row.dj_count };
}

/**
 * Step 3. Full sends the offers and opens one Stripe checkout for every DJ
 * from the same call, right here: the card is saved for this event and
 * Gelatin holds each DJ in the background. Every event gets its own checkout. Then the bookings page shows each DJ's status.
 */
export default function OfferForm({ full = false }: { full?: boolean }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<EventCheckout | null>(null);
  const { draft, setDraft, clear } = useDraft();
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  // Opening this step, and sending, re-check the picked DJs for the booking's night.
  const { taken, recheck, flag } = usePickedAvailability(draft);
  // Gelatin refused the send as `dj_unavailable` without naming a DJ we could match.
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!draft) return;
    if (!hasDjs(draft)) router.replace("/");
    else if (!eventComplete(draft)) router.replace("/event");
  }, [draft, router]);
  if (!draft || !hasDjs(draft) || !eventComplete(draft)) return <p className="empty">Loading…</p>;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || sending) return;
    const built = submissionBody(draft);
    if ("error" in built) { setError({ message: built.error }); return; }
    setSending(true);
    setError(null);
    setRefused(false);
    try {
      // Last look before sending: a DJ booked meanwhile is flagged here, not as an error.
      if (takenDjs(draft, await recheck(draft)).length > 0) { showTaken(); return; }
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(built.body) });
      const body = await response.json().catch(() => ({})) as { next?: string; checkout?: unknown; error?: string; request_id?: string | null; code?: string; dj_ids?: unknown };
      if (response.status === 401) { router.push("/login"); return; }
      if (response.status === 409 && body.code === "dj_unavailable") {
        // Booked between the last check and the send: same notice, never a raw error.
        const named = Array.isArray(body.dj_ids) ? body.dj_ids.filter((id): id is string => typeof id === "string") : [];
        const found = await recheck(draft);
        flag(named);
        if (takenDjs(draft, [...found, ...named]).length === 0) setRefused(true);
        showTaken();
        return;
      }
      // Full goes to this site's bookings list; Light straight to Gelatin's portal,
      // on an address the demo server already checked against GELATIN_PORTAL_ORIGINS.
      const portal = body.next?.startsWith("https://") || body.next?.startsWith("http://");
      if (!response.ok || !(body.next?.startsWith("/bookings") || portal)) {
        setError({ message: body.error ?? "Something went wrong. Try again.", requestId: body.request_id });
        return;
      }
      // Booked, and one checkout for every DJ came back with it: pay right here.
      const opened = !portal ? readCheckout(body.checkout, body.next!) : null;
      if (opened) { setCheckout(opened); return; }
      clear();
      if (portal) window.location.assign(body.next!);
      else router.push(body.next!);
    } catch {
      setError({ message: "Could not reach the demo server. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  const takenPicks = takenDjs(draft, taken);
  function showTaken() {
    requestAnimationFrame(() => document.getElementById("taken-title")?.closest("section")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
  function remove(id: string) {
    if (!draft) return;
    setDraft(removeDjs(draft, [id]));
    setRefused(false);
  }

  if (checkout) {
    const total = new Intl.NumberFormat("en-US", { style: "currency", currency: checkout.currency.toUpperCase() }).format(checkout.totalCents / 100);
    const leave = (path: string) => { clear(); router.push(path); };
    return (
      <section className="panel" aria-labelledby="pay-all-title">
        <div className="panel-head"><h2 id="pay-all-title">Pay for your DJs</h2></div>
        <div className="panel-body stack">
          <p className="hint">One card for {checkout.djCount === 1 ? "your DJ" : `all ${checkout.djCount} DJs`} · <strong>{total}</strong> in total. Gelatin holds each DJ separately and charges it only if that DJ accepts.</p>
          <div className="pay-frame">
            <span className="pay-frame-tag">Secure checkout · served by Gelatin</span>
            <EmbeddedCheckout session={checkout.session} onComplete={() => leave(`${checkout.next}&confirming=${Date.now()}`)} />
          </div>
          <div className="step-actions">
            <button className="button-secondary" type="button" onClick={() => leave(checkout.next)}>Pay later</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form className="stack" onSubmit={send}>
      {(takenPicks.length > 0 || refused) && <TakenNotice date={draft.date} djs={takenPicks} onRemove={(dj) => remove(dj.id)} />}
      <section className="panel panel-body stack" aria-label="Event">
        <div className="summary-line">
          <span><strong>{draft.eventName}</strong> <span className="hint">at {draft.venueName}{draft.venueAddress ? `, ${draft.venueAddress}` : ""}</span></span>
          <Link className="link-button" href="/event">Edit</Link>
        </div>
        <p className="hint">{longDate(draft.date)} · {draft.startTime}–{draft.endTime} ({draft.timeZone.replace("_", " ")}) · {draft.organizerName}, {draft.email}</p>
      </section>

      <section className="panel" aria-labelledby="fees-title">
        <div className="panel-head"><h2 id="fees-title">DJ fees (USD)</h2><Link className="link-button" href={`/?date=${draft.date}`}>Change DJs</Link></div>
        <div className="panel-body selected">
          {draft.selected.map((item) => (
            <div className="selected-row" key={item.id}>
              <strong>{item.name}</strong>
              <label className="money">
                <span className="visually-hidden">Fee for {item.name} (USD)</span>
                <span aria-hidden="true">$</span>
                <input
                  required inputMode="numeric" pattern="[0-9]*" value={item.fee} placeholder="Fee"
                  onChange={(e) => setDraft({ ...draft, selected: draft.selected.map((row) => (row.id === item.id ? { ...row, fee: e.target.value.replace(/[^0-9]/g, "") } : row)) })}
                />
              </label>
              <span className="hint">$50 to $20,000</span>
            </div>
          ))}
          <label className="field"><span>Note to DJs <span className="hint">optional</span></span>
            <textarea maxLength={600} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
        </div>
      </section>

      {error && (
        <p className="notice notice-error" role="alert">
          {error.message}{error.requestId && <> <span className="mono">Request {error.requestId}</span></>}
        </p>
      )}
      <div className="step-actions">
        <Link className="button-secondary" href="/event">Back</Link>
        <button className="button" type="submit" disabled={sending || takenPicks.length > 0}>
          {sending ? "Sending to Gelatin…" : full ? `Send offer${draft.selected.length > 1 ? "s" : ""} & pay` : `Send request${draft.selected.length > 1 ? "s" : ""} to Gelatin`}
        </button>
      </div>
    </form>
  );
}
