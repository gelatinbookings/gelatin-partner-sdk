import type { DirectoryGenre, GenreDirectory } from "./types.js";

/**
 * Genre helpers for a typeahead built from `listGenres`, with no request.
 * Gelatin compares genres with this same key, so the `genre` filter and these
 * helpers always agree.
 */

/**
 * The key Gelatin compares genres by: case, accents, whitespace and
 * punctuation are ignored, so `"Deep-House"` and `"deep house"` are one genre.
 * There is no synonym list. Text with no letters or digits keys to `""`.
 */
export function genreKey(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * The listed genre `value` names, or null when the directory has none. Use it
 * when the city changes: a picked genre the new city's directory doesn't have
 * would find no DJs, so drop it.
 */
export function findGenre(directory: GenreDirectory, value: string): DirectoryGenre | null {
  const key = genreKey(value);
  return key ? directory.genres.find((genre) => genreKey(genre.name) === key) ?? null : null;
}

/** Genres whose name contains `query` by the same key, keeping the directory's busiest-first order. */
export function filterGenres(directory: GenreDirectory, query: string): DirectoryGenre[] {
  const key = genreKey(query);
  return key ? directory.genres.filter((genre) => genreKey(genre.name).includes(key)) : directory.genres;
}
