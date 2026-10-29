"use client";

import { useEffect, useRef, useState } from "react";
import type { DirectoryGenre } from "@gelatinbookings/partner-sdk/types";
import { droppedGenreNotice, genreForCity } from "../lib/genre-choice";

/**
 * The Genre field's state, following the City field: when the organizer picks
 * another city, that city's genres load from /api/genres (`listGenres`) and a
 * picked genre the city doesn't have is dropped before the form is sent.
 */
export function useCityGenres(initial: { city: string; genre: string; genres: DirectoryGenre[] | null; droppedGenre: string | null }) {
  const [value, setValue] = useState(initial.genre);
  const [genres, setGenres] = useState(initial.genres);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial.droppedGenre ? droppedGenreNotice(initial.droppedGenre, initial.city) : null);
  const pending = useRef<AbortController | null>(null);
  const picked = useRef(value);
  useEffect(() => { picked.current = value; }, [value]);

  // A new URL is a new server read: take its genre, its list and its notice.
  // Reset while rendering, React's pattern for state that follows a prop.
  const [read, setRead] = useState(initial);
  if (read.genre !== initial.genre || read.genres !== initial.genres || read.droppedGenre !== initial.droppedGenre || read.city !== initial.city) {
    setRead(initial);
    setValue(initial.genre);
    setGenres(initial.genres);
    setNotice(initial.droppedGenre ? droppedGenreNotice(initial.droppedGenre, initial.city) : null);
  }
  useEffect(() => () => pending.current?.abort(), []);

  async function cityChanged(label: string) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/genres?${new URLSearchParams({ city: label })}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Genres unavailable");
      const directory = await response.json() as { genres: DirectoryGenre[] };
      const next = genreForCity(picked.current, directory, label);
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

  return { value, genres, loading, notice, cityChanged: (label: string) => void cityChanged(label), choose };
}
