"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventComplete, hasDjs, submissionBody } from "../../lib/draft";
import { longDate } from "../steps";
import { useDraft } from "../use-draft";

export default function OfferForm() {
  const router = useRouter();
  const { draft, setDraft, clear } = useDraft();
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [sending, setSending] = useState(false);
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
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(built.body) });
      const body = await response.json().catch(() => ({})) as { next?: string; error?: string; request_id?: string | null };
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok || !body.next?.startsWith("/bookings")) {
        setError({ message: body.error ?? "Something went wrong. Try again.", requestId: body.request_id });
        return;
      }
      clear();
      router.push(body.next);
    } catch {
      setError({ message: "Could not reach the demo server. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="stack" onSubmit={send}>
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
        <button className="button" type="submit" disabled={sending}>
          {sending ? "Sending to Gelatin…" : `Send request${draft.selected.length > 1 ? "s" : ""} to Gelatin`}
        </button>
      </div>
    </form>
  );
}
