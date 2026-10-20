"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hasDjs, MAX_DRAFT_DJS, toggleDj, withAvailabilityDate } from "../lib/draft";
import { longDate } from "./steps";
import { useDraft } from "./use-draft";

export type CatalogDj = {
  id: string;
  name: string;
  city: string;
  tier: string;
  initials: string;
  /** Gelatin's profile image (https only); initials when there is none. */
  imageUrl: string | null;
  /** For the date in the URL; null when Gelatin didn't say. */
  available: boolean | null;
  rateDollars: number | null;
  profileUrl: string | null;
};

export default function DjPicker({ date, suggestedDate, city, djs, nextHref, failure }: {
  date: string | null;
  /** Worked out once on the server, so server and browser render the same field. */
  suggestedDate: string;
  city: string;
  djs: CatalogDj[];
  nextHref: string | null;
  failure: { message: string; requestId: string | null } | null;
}) {
  const router = useRouter();
  const { draft, setDraft } = useDraft();
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(new Set());
  const synced = useRef<string | null>(null);

  // Coming back to step 1 without a date: show the night already picked.
  useEffect(() => {
    if (!date && draft?.date) router.replace(`/?date=${encodeURIComponent(draft.date)}`);
  }, [date, draft, router]);

  // Availability was read for the URL's date, so that is the booking's date.
  useEffect(() => {
    if (!draft || !date || synced.current === date) return;
    synced.current = date;
    const result = withAvailabilityDate(draft, date);
    if (result.draft !== draft) setDraft(result.draft);
    setCleared(result.cleared);
  }, [draft, date, setDraft]);

  const ready = draft && date && draft.date === date;
  const selected = new Set(ready ? draft.selected.map((item) => item.id) : []);

  return (
    <div className="stack">
      <form className="panel filters" method="get" action="/">
        <label className="field">Event date<input name="date" type="date" required defaultValue={date ?? suggestedDate} /></label>
        <label className="field">City<input name="city" defaultValue={city} placeholder="Any city" maxLength={80} /></label>
        <button className="button" type="submit">{date ? "Update" : "Show available DJs"}</button>
      </form>

      {cleared && <p className="notice notice-info" role="status">You changed the date, so pick your DJs again for {longDate(date ?? "")}.</p>}

      {date && (
        <section className="panel" aria-labelledby="catalog-title">
          <div className="panel-head">
            <h2 id="catalog-title">DJs on {longDate(date)}</h2>
            <span className="hint">{selected.size ? `${selected.size} of ${MAX_DRAFT_DJS} picked` : `Pick up to ${MAX_DRAFT_DJS}`}</span>
          </div>
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
                const picked = selected.has(dj.id);
                const free = dj.available === true;
                return (
                  <li key={dj.id} className="dj-row" data-selected={picked} data-unavailable={!free}>
                    {dj.imageUrl && !brokenImages.has(dj.id)
                      // eslint-disable-next-line @next/next/no-img-element -- Gelatin-hosted image, sized by CSS.
                      ? <img className="avatar avatar-photo" src={dj.imageUrl} alt="" loading="lazy" width={42} height={42}
                          onError={() => setBrokenImages((current) => new Set(current).add(dj.id))} />
                      : <span className="avatar" aria-hidden="true">{dj.initials}</span>}
                    <span className="dj-copy">
                      <strong>{dj.name}</strong>
                      <small>
                        {dj.city} · {dj.tier}{dj.rateDollars !== null && <> · from ${dj.rateDollars.toLocaleString()}</>}
                        {dj.profileUrl && <> · <a href={dj.profileUrl} target="_blank" rel="noreferrer noopener">Profile</a></>}
                      </small>
                    </span>
                    <span className={free ? "tag tag-ok" : "tag tag-no"}>{free ? "Available" : "Unavailable"}</span>
                    <button
                      className={picked ? "button" : "button-secondary"} type="button"
                      disabled={!ready || (!free && !picked)} aria-pressed={picked}
                      aria-label={`${picked ? "Remove" : "Add"} ${dj.name}`}
                      onClick={() => {
                        if (!draft) return;
                        const result = toggleDj(draft, dj);
                        setError(result.error ?? null);
                        if (!result.error) { setDraft(result.draft); setCleared(false); }
                      }}
                    >
                      {picked ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {nextHref && <div className="pager"><a className="button-secondary" href={nextHref}>Next page</a></div>}
        </section>
      )}
      {date && (
        <p className="attrib"><i aria-hidden="true" /> DJs, availability and rates from <b>Gelatin</b></p>
      )}

      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {date && (
        <div className="step-actions">
          <span className="hint">{ready && draft.selected.length ? draft.selected.map((item) => item.name).join(", ") : "Add at least one available DJ."}</span>
          <button className="button" type="button" disabled={!ready || !hasDjs(draft)} onClick={() => router.push("/event")}>
            Continue to event details
          </button>
        </div>
      )}
    </div>
  );
}
