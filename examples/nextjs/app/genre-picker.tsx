"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterGenres } from "@gelatinbookings/partner-sdk/genres";
import type { DirectoryGenre } from "@gelatinbookings/partner-sdk/types";

/**
 * The Genre control, next to City and built the same way: a searchable list
 * with a DJ count on every row. It offers only genres from `listGenres` for
 * the chosen city, so every pick finds at least one DJ. The chosen name goes
 * to `listDjs` as `genre`. Controlled: the date picker owns the value so a
 * city change can drop a genre that city doesn't have.
 */
export default function GenrePicker({ genres, value, onChange, loading }: {
  /** Null when Gelatin could not list genres; the field falls back to typing. */
  genres: DirectoryGenre[] | null;
  value: string;
  onChange: (name: string) => void;
  /** The city changed and its genres are on their way. */
  loading: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => filterGenres({ genres: genres ?? [] }, search), [genres, search]);
  // "Any genre" first unless the organizer is typing; arrow keys walk this list.
  const options = useMemo<Array<DirectoryGenre | null>>(() => [...(search.trim() ? [] : [null]), ...shown], [shown, search]);
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" });
  });

  if (!genres) {
    return (
      <label className="field">Genre
        <input name="genre" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Any genre" maxLength={60} />
      </label>
    );
  }

  function show() {
    setSearch("");
    setActive(Math.max(0, options.findIndex((option) => (option?.name ?? "") === value)));
    setOpen(true);
  }

  function choose(option: DirectoryGenre | null) {
    onChange(option?.name ?? "");
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.min(options.length - 1, Math.max(0, current + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options.length) choose(options[Math.min(active, options.length - 1)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }

  const offset = search.trim() ? 0 : 1;
  const empty = genres.length === 0;

  return (
    <div className="field city-field" ref={root}>
      <span id={`${id}-label`}>Genre</span>
      <input type="hidden" name="genre" value={value} />
      <button ref={trigger} type="button" className="city-trigger" aria-haspopup="dialog" aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`} disabled={loading || (empty && !value)} aria-busy={loading}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }}>
        <span id={`${id}-value`} data-placeholder={!value}>
          {loading ? "Loading genres…" : value || (empty ? "No genres listed" : "Any genre")}
        </span>
        <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open && (
        <div className="city-pop" role="dialog" aria-label="Choose a genre">
          <input
            autoFocus role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`}
            aria-activedescendant={options.length ? optionId(Math.min(active, options.length - 1)) : undefined}
            aria-label="Search genres" placeholder="House, techno, afrobeats…" value={search} spellCheck={false} autoComplete="off"
            onChange={(event) => { setSearch(event.target.value); setActive(0); }} onKeyDown={onKeyDown}
          />
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Genres" className="city-list">
            {!search.trim() && (
              <li id={optionId(0)} role="option" aria-selected={!value} className="city-option city-any" data-active={active === 0}
                onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(0)} onClick={() => choose(null)}>
                <span className="city-name">Any genre</span>
              </li>
            )}
            {shown.map((genre, index) => {
              const position = index + offset;
              return (
                <li key={genre.name} id={optionId(position)} role="option" aria-selected={genre.name === value}
                  className="city-option" data-active={position === active}
                  onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(position)} onClick={() => choose(genre)}>
                  <span className="city-name">{genre.name}</span>
                  <span className="city-count" aria-label={`${genre.dj_count} ${genre.dj_count === 1 ? "DJ" : "DJs"}`}>{genre.dj_count}</span>
                </li>
              );
            })}
          </ul>
          {options.length === 0 && (
            <p className="city-empty" role="status">No DJs here list &ldquo;{search.trim()}&rdquo;. Only genres with DJs in this city are shown.</p>
          )}
        </div>
      )}
    </div>
  );
}
