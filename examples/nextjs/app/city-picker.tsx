"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterCityDirectory } from "@gelatinbookings/partner-sdk/places";
import type { CityDirectory, DirectoryCity } from "@gelatinbookings/partner-sdk/types";

/**
 * The City control: searchable, grouped by state, a DJ count on every row.
 * Typing a city, a state ("GA") or "US" narrows the list. A city with no DJs
 * stays listed and can still be picked, so a quiet market reads as unopened
 * rather than missing. The chosen label goes to `listDjs` as `city`. Key it
 * on `value` so a new URL city resets the choice. `onChange` hears each pick,
 * so the Genre field can follow the city before the form is sent.
 */
export default function CityPicker({ directory, value, onChange }: {
  directory: CityDirectory; value: string; onChange?: (label: string) => void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => filterCityDirectory(directory, search), [directory, search]);
  // "Any city" first, then every visible city in display order; arrow keys walk this list.
  const options = useMemo<Array<DirectoryCity | null>>(() => [
    ...(search.trim() ? [] : [null]),
    ...shown.countries.flatMap((country) => country.regions.flatMap((region) => region.cities)),
  ], [shown, search]);
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

  function show() {
    const selected = options.findIndex((option) => (option?.label ?? "") === chosen);
    setSearch("");
    setActive(Math.max(0, selected));
    setOpen(true);
  }

  function choose(option: DirectoryCity | null) {
    const label = option?.label ?? "";
    setChosen(label);
    if (label !== chosen) onChange?.(label);
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

  let index = search.trim() ? 0 : 1;
  const row = (city: DirectoryCity, region: string | null) => {
    const position = index++;
    return (
      <li key={city.label} id={optionId(position)} role="option" aria-selected={city.label === chosen}
        className="city-option" data-active={position === active} data-empty={city.dj_count === 0}
        onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(position)} onClick={() => choose(city)}>
        <span className="city-name">{city.name}</span>
        {region && <span className="city-state">{region}</span>}
        {city.dj_count > 0
          ? <span className="city-count" aria-label={`${city.dj_count} ${city.dj_count === 1 ? "DJ" : "DJs"}`}>{city.dj_count}</span>
          : <span className="city-none">No DJs yet</span>}
      </li>
    );
  };

  return (
    <div className="field city-field" ref={root}>
      <span id={`${id}-label`}>City</span>
      <input type="hidden" name="city" value={chosen} />
      <button ref={trigger} type="button" className="city-trigger" aria-haspopup="dialog" aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`} onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }}>
        <span id={`${id}-value`} data-placeholder={!chosen}>{chosen || "Any city"}</span>
        <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open && (
        <div className="city-pop" role="dialog" aria-label="Choose a city">
          <input
            autoFocus role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`}
            aria-activedescendant={options.length ? optionId(Math.min(active, options.length - 1)) : undefined}
            aria-label="Search cities" placeholder="City, state or US" value={search} spellCheck={false} autoComplete="off"
            onChange={(event) => { setSearch(event.target.value); setActive(0); }} onKeyDown={onKeyDown}
          />
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Cities" className="city-list">
            {!search.trim() && (
              <li id={optionId(0)} role="option" aria-selected={!chosen} className="city-option city-any" data-active={active === 0}
                onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(0)} onClick={() => choose(null)}>
                <span className="city-name">Any city</span>
              </li>
            )}
            {shown.countries.map((country) => (
              <li key={country.code ?? "other"} role="presentation">
                <div className="city-country" aria-hidden="true">{country.name}</div>
                <ul role="presentation">
                  {country.regions.map((region) => (
                    <li key={region.code ?? "other"} role="presentation">
                      {region.code && <div className="city-region" id={`${id}-region-${region.code}`}>{region.name}</div>}
                      <ul role="group" aria-label={region.code ? `${region.name}, ${country.name}` : country.name}>
                        {region.cities.map((city) => row(city, region.code))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {options.length === 0 && (
            <p className="city-empty" role="status">No city matches &ldquo;{search.trim()}&rdquo;. Try a state code like GA.</p>
          )}
        </div>
      )}
    </div>
  );
}
