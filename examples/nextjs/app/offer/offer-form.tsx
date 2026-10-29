"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventComplete, hasDjs, removeDjs, submissionBody, takenDjs } from "../../lib/draft";
import { longDate } from "../steps";
import { TakenNotice } from "../taken-notice";
import { useDraft } from "../use-draft";
import { usePickedAvailability } from "../use-picked-availability";

export default function OfferForm() {
  const router = useRouter();
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
      const body = await response.json().catch(() => ({})) as { next?: string; error?: string; request_id?: string | null; code?: string; dj_ids?: unknown };
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
          {sending ? "Sending to Gelatin…" : `Send request${draft.selected.length > 1 ? "s" : ""} to Gelatin`}
        </button>
      </div>
    </form>
  );
}
