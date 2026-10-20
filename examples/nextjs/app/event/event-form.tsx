"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventComplete, hasDjs, type Draft } from "../../lib/draft";
import { sampleEventDetails } from "../../lib/sample";
import { DEMO_TIME_ZONES } from "../../lib/time";
import { longDate } from "../steps";
import { useDraft } from "../use-draft";

export default function EventForm() {
  const router = useRouter();
  const { draft, setDraft } = useDraft();
  useEffect(() => { if (draft && !hasDjs(draft)) router.replace("/"); }, [draft, router]);
  if (!draft || !hasDjs(draft)) return <p className="empty">Loading…</p>;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  return (
    <form
      className="panel panel-body stack"
      onSubmit={(event) => { event.preventDefault(); if (eventComplete(draft)) router.push("/offer"); }}
    >
      <div className="summary-line">
        <span><span className="hint">Date</span> <strong>{longDate(draft.date)}</strong></span>
        <Link className="link-button" href={`/?date=${draft.date}`}>Change date or DJs</Link>
      </div>
      <div className="autofill">
        <span className="hint">Testing? Fill the event name and venue with made-up details.</span>
        <button className="button-secondary button-small" type="button" onClick={() => setDraft({ ...draft, ...sampleEventDetails() })}>
          Fill with sample details
        </button>
      </div>
      <div className="form-grid">
        <label className="field full">Event name<input required maxLength={120} value={draft.eventName} onChange={(e) => update("eventName", e.target.value)} /></label>
        <label className="field full">Venue<input required maxLength={120} value={draft.venueName} onChange={(e) => update("venueName", e.target.value)} /></label>
        <label className="field">Starts<input required type="time" value={draft.startTime} onChange={(e) => update("startTime", e.target.value)} /></label>
        <label className="field">Ends<input required type="time" value={draft.endTime} onChange={(e) => update("endTime", e.target.value)} /></label>
        <label className="field full">Time zone
          <select value={draft.timeZone} onChange={(e) => update("timeZone", e.target.value)}>
            {DEMO_TIME_ZONES.map((zone) => <option key={zone} value={zone}>{zone.replace("_", " ")}</option>)}
          </select>
        </label>
        <p className="hint full">An end time before the start means the next morning.</p>
        <label className="field">Organizer name<input required maxLength={80} autoComplete="name" value={draft.organizerName} onChange={(e) => update("organizerName", e.target.value)} /></label>
        <label className="field">Organizer email<input required type="email" maxLength={254} autoComplete="email" value={draft.email} onChange={(e) => update("email", e.target.value)} /></label>
      </div>
      <div className="step-actions">
        <Link className="button-secondary" href={`/?date=${draft.date}`}>Back</Link>
        <button className="button" type="submit">Continue to the offer</button>
      </div>
    </form>
  );
}
