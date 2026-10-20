"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_TIME_ZONES } from "../lib/time";

export type CatalogDj = {
  id: string;
  name: string;
  city: string;
  tier: string;
  initials: string;
  /** Null when no date filter is set, so availability is unknown. */
  available: boolean | null;
  rateDollars: number | null;
  profileUrl: string | null;
};

type Selected = { id: string; name: string; fee: string };
type Draft = {
  nonce: string;
  eventName: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  email: string;
  organizerName: string;
  note: string;
  selected: Selected[];
};

const STORAGE_KEY = "partner-demo-draft-v1";
const MAX_DJS = 5;

function inTwoWeeks() {
  const date = new Date(Date.now() + 14 * 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function freshDraft(): Draft {
  return {
    nonce: crypto.randomUUID(), eventName: "", venueName: "", date: inTwoWeeks(), startTime: "21:00", endTime: "01:00",
    timeZone: "America/New_York", email: "", organizerName: "", note: "", selected: [],
  };
}

function loadDraft(): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Draft | null;
    if (value && typeof value.nonce === "string" && Array.isArray(value.selected)) return { ...freshDraft(), ...value };
  } catch { /* storage unavailable: start fresh */ }
  return freshDraft();
}

function saveDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable: the form still works for this page */ }
}

export default function BookingBuilder({ djs, filters, nextHref, failure }: {
  djs: CatalogDj[];
  filters: { city: string; date: string };
  nextHref: string | null;
  failure: { message: string; requestId: string | null } | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDraft(loadDraft()));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (draft) saveDraft(draft); }, [draft]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  }

  function toggle(dj: CatalogDj) {
    if (!draft) return;
    const exists = draft.selected.some((item) => item.id === dj.id);
    if (!exists && draft.selected.length >= MAX_DJS) {
      setError({ message: `The demo sends at most ${MAX_DJS} DJs per booking.` });
      return;
    }
    update("selected", exists
      ? draft.selected.filter((item) => item.id !== dj.id)
      : [...draft.selected, { id: dj.id, name: dj.name, fee: dj.rateDollars ? String(dj.rateDollars) : "" }]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || sending) return;
    if (draft.selected.length === 0) { setError({ message: "Choose at least one DJ." }); return; }
    const fees = draft.selected.map((item) => Number(item.fee));
    if (fees.some((fee) => !Number.isInteger(fee) || fee < 50 || fee > 20_000)) {
      setError({ message: "Each DJ fee must be a whole number of dollars between $50 and $20,000." });
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: draft.nonce, event_name: draft.eventName, venue_name: draft.venueName, date: draft.date,
          start_time: draft.startTime, end_time: draft.endTime, time_zone: draft.timeZone,
          organizer_email: draft.email, organizer_name: draft.organizerName,
          ...(draft.note.trim() ? { note: draft.note } : {}),
          djs: draft.selected.map((item, index) => ({ id: item.id, name: item.name, fee_dollars: fees[index] })),
        }),
      });
      const body = await response.json().catch(() => ({})) as { next?: string; error?: string; request_id?: string | null };
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok || !body.next?.startsWith("/bookings")) {
        setError({ message: body.error ?? "Something went wrong. Try again.", requestId: body.request_id });
        return;
      }
      saveDraft(null);
      router.push(body.next);
    } catch {
      setError({ message: "Could not reach the demo server. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  const selectedIds = new Set(draft?.selected.map((item) => item.id));

  return (
    <div className="grid">
      <section className="panel" aria-labelledby="catalog-title">
        <div className="panel-head"><h2 id="catalog-title">Gelatin DJs</h2><span className="hint">{djs.length} shown</span></div>
        <form className="filters" method="get" action="/">
          <label className="field">City<input name="city" defaultValue={filters.city} placeholder="Any city" maxLength={80} /></label>
          <label className="field">Availability on<input name="date" type="date" defaultValue={filters.date} /></label>
          <button className="button-secondary" type="submit">Filter</button>
        </form>
        {failure ? (
          <div className="panel-body">
            <p className="notice notice-error" role="alert">
              {failure.message}{failure.requestId && <> <span className="mono">Request {failure.requestId}</span></>}
            </p>
          </div>
        ) : djs.length === 0 ? (
          <p className="empty">No DJs match. Gelatin may not have enabled the catalog for this partner yet.</p>
        ) : (
          <ul className="dj-list">
            {djs.map((dj) => {
              const selected = selectedIds.has(dj.id);
              return (
                <li key={dj.id} className="dj-row" data-selected={selected}>
                  <span className="avatar" aria-hidden="true">{dj.initials}</span>
                  <span className="dj-copy">
                    <strong>{dj.name}</strong>
                    <small>
                      {dj.city} · {dj.tier}{dj.rateDollars !== null && <> · from ${dj.rateDollars.toLocaleString()}</>}
                      {dj.profileUrl && <> · <a href={dj.profileUrl} target="_blank" rel="noreferrer noopener">Profile</a></>}
                    </small>
                  </span>
                  {dj.available !== null && (
                    <span className={dj.available ? "tag tag-ok" : "tag tag-no"}>{dj.available ? "Available" : "Unavailable"}</span>
                  )}
                  <button
                    className={selected ? "button" : "button-secondary"} type="button" onClick={() => toggle(dj)}
                    disabled={!draft} aria-pressed={selected} aria-label={`${selected ? "Remove" : "Add"} ${dj.name}`}
                  >
                    {selected ? "Added" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {nextHref && <div className="pager"><a className="button-secondary" href={nextHref}>Next page</a></div>}
      </section>

      <section className="panel sticky" aria-labelledby="event-title">
        <div className="panel-head"><h2 id="event-title">Your event</h2><span className="hint">Step 2 of 3</span></div>
        {!draft ? <p className="empty">Loading…</p> : (
          <form className="panel-body stack" onSubmit={submit} noValidate={false}>
            <div className="form-grid">
              <label className="field full">Event name<input required maxLength={120} value={draft.eventName} onChange={(e) => update("eventName", e.target.value)} /></label>
              <label className="field full">Venue<input required maxLength={120} value={draft.venueName} onChange={(e) => update("venueName", e.target.value)} /></label>
              <label className="field">Date<input required type="date" value={draft.date} onChange={(e) => update("date", e.target.value)} /></label>
              <label className="field">Time zone
                <select value={draft.timeZone} onChange={(e) => update("timeZone", e.target.value)}>
                  {DEMO_TIME_ZONES.map((zone) => <option key={zone} value={zone}>{zone.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="field">Starts<input required type="time" value={draft.startTime} onChange={(e) => update("startTime", e.target.value)} /></label>
              <label className="field">Ends<input required type="time" value={draft.endTime} onChange={(e) => update("endTime", e.target.value)} /></label>
              <label className="field">Organizer name<input required maxLength={80} autoComplete="name" value={draft.organizerName} onChange={(e) => update("organizerName", e.target.value)} /></label>
              <label className="field">Organizer email<input required type="email" maxLength={254} autoComplete="email" value={draft.email} onChange={(e) => update("email", e.target.value)} /></label>
              <p className="hint full">Gelatin sends payment and booking emails to this address. An end time before the start means the next morning.</p>
            </div>

            <div className="selected" aria-live="polite">
              <p className="field" style={{ margin: 0 }}>DJ fees (USD)</p>
              {draft.selected.length === 0 ? (
                <p className="notice notice-info">Add up to {MAX_DJS} DJs from the list.</p>
              ) : draft.selected.map((item) => (
                <div className="selected-row" key={item.id}>
                  <strong>{item.name}</strong>
                  <label className="money">
                    <span className="visually-hidden">Fee for {item.name} (USD)</span>
                    <span aria-hidden="true">$</span>
                    <input
                      required inputMode="numeric" pattern="[0-9]*" value={item.fee} placeholder="Fee"
                      onChange={(e) => update("selected", draft.selected.map((row) => (row.id === item.id ? { ...row, fee: e.target.value.replace(/[^0-9]/g, "") } : row)))}
                    />
                  </label>
                  <button className="link-button" type="button" onClick={() => update("selected", draft.selected.filter((row) => row.id !== item.id))}>Remove</button>
                </div>
              ))}
              <label className="field"><span>Note to DJs <span className="hint">optional</span></span>
                <textarea maxLength={600} value={draft.note} onChange={(e) => update("note", e.target.value)} />
              </label>
            </div>

            {error && (
              <p className="notice notice-error" role="alert">
                {error.message}{error.requestId && <> <span className="mono">Request {error.requestId}</span></>}
              </p>
            )}
            <button className="button button-wide" type="submit" disabled={sending}>
              {sending ? "Sending to Gelatin…" : `Send request${draft.selected.length > 1 ? "s" : ""} to Gelatin`}
            </button>
            <p className="hint">Gelatin calculates the organizer total. You authorize payment for each DJ on the next page.</p>
          </form>
        )}
      </section>
    </div>
  );
}
