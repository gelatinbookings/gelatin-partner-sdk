"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BUDGET_BANDS, type BudgetBand } from "@gelatinbookings/partner-sdk/budget";
import type { CityDirectory, DirectoryGenre } from "@gelatinbookings/partner-sdk/types";
import type { CatalogDj } from "../lib/catalog-view";
import { cityFromAddress, cityWithNoDjs } from "../lib/city-choice";
import { lineupChosen, MAX_DRAFT_DJS, removeDjs, skipLineup, takenDjs, toggleDj, withAvailabilityDate } from "../lib/draft";
import { nextStepHref } from "../lib/flow";
import CityPicker from "./city-picker";
import CityWaitlist from "./city-waitlist";
import GenrePicker from "./genre-picker";
import { longDate } from "./steps";
import { TakenNotice } from "./taken-notice";
import { useCityGenres } from "./use-city-genres";
import { replaceDraft, useDraft } from "./use-draft";

export default function DjPicker({ date, suggestedDate, city, cityChosen, budget, cities, genre: urlGenre, genres: urlGenres, droppedGenre, djs, nextHref, failure, light = false }: {
  date: string | null;
  /** Worked out once on the server, so server and browser render the same field. */
  suggestedDate: string;
  city: string;
  /** The URL names a city, even "Any city"; only then is the event's own city not applied. */
  cityChosen: boolean;
  /** Ticked budget bands; none means any budget. */
  budget: readonly BudgetBand[];
  /** Null when Gelatin could not list cities; the field falls back to typing. */
  cities: CityDirectory | null;
  /** The genre the list is filtered by; "" for any. */
  genre: string;
  /** The URL city's genres; null when Gelatin could not list them. */
  genres: DirectoryGenre[] | null;
  /** A genre in the URL that the URL city's DJs don't list, so it was not applied. */
  droppedGenre: string | null;
  /** The Light tier: a city and a DJ, with none of the Full extras. */
  light?: boolean;
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
  const genre = useCityGenres({ city, genre: urlGenre, genres: urlGenres, droppedGenre });

  // Coming back to step 1: show the night already picked, in the event's city
  // when its address names one and no city was chosen here.
  useEffect(() => {
    if (!draft) return;
    const eventCity = cityChosen ? null : cityFromAddress(draft.venueAddress);
    if (!eventCity && (date || !draft.date)) return;
    const params = new URLSearchParams();
    if (date || draft.date) params.set("date", date ?? draft.date);
    const nextCity = eventCity ?? (cityChosen ? city : null);
    if (nextCity !== null) params.set("city", nextCity);
    // Kept as is; the server drops it if the event's city has no DJs in it.
    if (urlGenre) params.set("genre", urlGenre);
    for (const band of budget) params.append("budget", band);
    router.replace(`/?${params}`);
  }, [date, draft, router, city, cityChosen, urlGenre, budget]);

  // Availability was read for the URL's date, so that is the booking's date.
  useEffect(() => {
    if (!draft || !date || synced.current === date) return;
    synced.current = date;
    const result = withAvailabilityDate(draft, date);
    if (result.draft !== draft) setDraft(result.draft);
    setCleared(result.cleared);
  }, [draft, date, setDraft]);

  const ready = draft && date && draft.date === date;
  // A city Gelatin lists with no DJs at all gets "notify me", not a dead end.
  const emptyCity = cityWithNoDjs(cities, city);
  const selected = new Set(ready ? draft.selected.map((item) => item.id) : []);
  const noLineup = Boolean(ready && draft.noLineup);
  // Picked earlier, but this fresh read says the DJ is no longer free that night.
  // A skipped lineup has no picks to check.
  const taken = ready && !noLineup ? takenDjs(draft, djs.filter((dj) => dj.available !== true).map((dj) => dj.id)) : [];

  return (
    <div className="stack">
      <form className="panel filters" method="get" action="/">
        <label className="field">Event date<input name="date" type="date" required defaultValue={date ?? suggestedDate} /></label>
        {cities
          ? <CityPicker key={city} directory={cities} value={city} onChange={genre.cityChanged} />
          : <label className="field">City<input name="city" defaultValue={city} placeholder="Any city" maxLength={100} /></label>}
        {!light && <GenrePicker genres={genre.genres} value={genre.value} loading={genre.loading} onChange={genre.choose} />}
        {!light && <fieldset className="budget">
          <legend className="field">Budget <span className="hint">Any if none ticked</span></legend>
          <div className="budget-options">
            {BUDGET_BANDS.map((band) => (
              <label key={band.key} className="budget-option">
                <input type="checkbox" name="budget" value={band.key} defaultChecked={budget.includes(band.key)} />
                {band.label}
              </label>
            ))}
          </div>
        </fieldset>}
        <button className="button" type="submit" disabled={genre.loading}>{date ? "Update" : "Show available DJs"}</button>
      </form>

      {genre.notice && <p className="notice notice-info" role="status">{genre.notice}</p>}

      {cleared && <p className="notice notice-info" role="status">You changed the date, so pick your DJs again for {longDate(date ?? "")}.</p>}

      {!light && ready && taken.length > 0 && (
        <TakenNotice date={date} djs={taken} pickLink={false} onRemove={(dj) => setDraft(removeDjs(draft, [dj.id]))} />
      )}

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
          ) : djs.length === 0 && emptyCity ? (
            <CityWaitlist key={emptyCity.label} city={emptyCity} />
          ) : djs.length === 0 ? (
            <p className="empty">
              {urlGenre || budget.length
                ? <>No {urlGenre && `${urlGenre} `}DJs{city && <> in {city}</>}{budget.length > 0 && <> in {budget.length === 1 ? "this budget" : "these budgets"}</>}. Try another {urlGenre && budget.length ? "genre or budget" : urlGenre ? "genre, or Any genre" : "band, or clear them all"}.</>
                : city
                  ? <>No DJs in {city} yet, including DJs who travel there. Try a nearby city or Any city.</>
                  : <>No DJs match. Gelatin may not have enabled the catalog for this partner yet.</>}
            </p>
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
                      {!light && <small className="dj-draw">{dj.drawLabel}</small>}
                      {!light && dj.genres.length > 0 && (
                        <span className="dj-genres" aria-label={`Genres: ${dj.genres.join(", ")}`}>
                          {dj.genres.map((name) => <span key={name} className="genre-chip">{name}</span>)}
                        </span>
                      )}
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

      {date && !light && (
        <div className="skip-lineup" data-chosen={noLineup}>
          <span className="skip-copy">
            <strong>{noLineup ? "No lineup for this event" : "No lineup right now?"}</strong>
            <span className="hint">
              {noLineup
                ? "The event is created without talent. Add a DJ above to book one instead."
                : selected.size
                  ? `Create the event without talent and add DJs later. This removes the ${selected.size === 1 ? "DJ" : `${selected.size} DJs`} you picked. Nothing is sent and nothing is charged.`
                  : "Create the event without talent and add DJs later. Nothing is sent and nothing is charged."}
            </span>
          </span>
          {!noLineup && (
            <button
              className="button-secondary" type="button" disabled={!ready}
              onClick={() => {
                if (!draft) return;
                const next = skipLineup(draft);
                // Saved directly, not through state, because the page changes straight away.
                replaceDraft(next);
                router.push(nextStepHref("/", next));
              }}
            >
              Skip, no lineup right now
            </button>
          )}
        </div>
      )}

      {date && (
        <div className="step-actions">
          <span className="hint">
            {ready && draft.selected.length
              ? draft.selected.map((item) => item.name).join(", ")
              : noLineup ? "No lineup. Nothing will be sent to a DJ." : light ? "Add at least one available DJ." : "Add at least one available DJ, or skip the lineup."}
          </span>
          <button className="button" type="button" disabled={!ready || !lineupChosen(draft)} onClick={() => draft && router.push(nextStepHref("/", draft))}>
            Continue to event details
          </button>
        </div>
      )}
    </div>
  );
}
