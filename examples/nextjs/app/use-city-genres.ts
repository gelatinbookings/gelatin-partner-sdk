"use client";

import { useEffect, useRef, useState } from "react";
import type { BudgetBand } from "@gelatinbookings/partner-sdk/budget";
import type { DirectoryGenre } from "@gelatinbookings/partner-sdk/types";
import { droppedGenreNotice, genreForCity } from "../lib/genre-choice";

/**
 * The Genre field's state, following the City field: when the organizer picks
 * another city, or ticks different budget bands, the genres DJs there and in
 * those bands list load from /api/genres (`listGenres`), and a picked genre
 * that no longer applies is dropped before the form is sent.
 */
export function useCityGenres(initial: { city: string; budget: readonly BudgetBand[]; genre: string; genres: DirectoryGenre[] | null; droppedGenre: string | null }) {
  const [value, setValue] = useState(initial.genre);
  const [genres, setGenres] = useState(initial.genres);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial.droppedGenre ? droppedGenreNotice(initial.droppedGenre, initial.city, initial.budget.length) : null);
  const pending = useRef<AbortController | null>(null);
  const picked = useRef(value);
  useEffect(() => { picked.current = value; }, [value]);
  // What the genre list was last asked for, so a city change keeps the bands and a band change keeps the city.
  const asked = useRef({ city: initial.city, budget: initial.budget });

  // A new URL is a new server read: take its genre, its list and its notice.
  // Reset while rendering, React's pattern for state that follows a prop.
  const [read, setRead] = useState(initial);
  if (read.genre !== initial.genre || read.genres !== initial.genres || read.droppedGenre !== initial.droppedGenre || read.city !== initial.city
    || read.budget.join() !== initial.budget.join()) {
    setRead(initial);
    setValue(initial.genre);
    setGenres(initial.genres);
    setNotice(initial.droppedGenre ? droppedGenreNotice(initial.droppedGenre, initial.city, initial.budget.length) : null);
  }
  useEffect(() => { asked.current = { city: initial.city, budget: initial.budget }; }, [initial.city, initial.budget]);
  useEffect(() => () => pending.current?.abort(), []);

  async function reload(label: string, budget: readonly BudgetBand[]) {
    asked.current = { city: label, budget };
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const query = new URLSearchParams({ city: label });
      for (const band of budget) query.append("budget", band);
      const response = await fetch(`/api/genres?${query}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Genres unavailable");
      const directory = await response.json() as { genres: DirectoryGenre[] };
      const next = genreForCity(picked.current, directory, label, budget.length);
      setGenres(directory.genres);
      setValue(next.genre);
      setNotice(next.notice);
    } catch {
      if (controller.signal.aborted) return;
      // Typing still works: Gelatin answers a genre the city lacks with an empty page.
      setGenres(null);
    } finally {
      if (pending.current === controller) setLoading(false);
    }
  }

  function choose(name: string) {
    setValue(name);
    setNotice(null);
  }

  return {
    value, genres, loading, notice, choose,
    cityChanged: (label: string) => void reload(label, asked.current.budget),
    budgetChanged: (budget: readonly BudgetBand[]) => void reload(asked.current.city, budget),
  };
}
