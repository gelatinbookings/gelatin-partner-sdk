import { findGenre } from "@gelatinbookings/partner-sdk/genres";
import type { GenreDirectory } from "@gelatinbookings/partner-sdk/types";

/**
 * The picked genre after the city changes to one with `directory`'s genres:
 * kept, under the new city's spelling, when the city has DJs in it; otherwise
 * dropped, with a line telling the organizer why.
 */
export function genreForCity(picked: string, directory: GenreDirectory, cityLabel: string, budgetBands = 0): { genre: string; notice: string | null } {
  if (!picked) return { genre: "", notice: null };
  const listed = findGenre(directory, picked);
  if (listed) return { genre: listed.name, notice: null };
  return { genre: "", notice: droppedGenreNotice(picked, cityLabel, budgetBands) };
}

/** `budgetBands` is how many budget bands are ticked, so the note names the budget when it is part of why. */
export function droppedGenreNotice(genre: string, cityLabel: string, budgetBands = 0): string {
  const budget = budgetBands === 0 ? "" : budgetBands === 1 ? " in this budget" : " in these budgets";
  return `No DJs in ${cityLabel || "any city"}${budget} list “${genre}”, so the genre filter was cleared.`;
}
