/**
 * The budget bands `listDjs({ budget })` filters on. A DJ is in a band when
 * the minimum rate they really charge is at least the band's `min_cents` and
 * below its `max_cents` (no upper bound for the last band). So $300 exactly is
 * in "$300–600", $600 in "$600–1,000" and $1,000 in "$1,000+".
 *
 * Several bands at once match a DJ in any of them. The filter uses the DJ's
 * real rate, so a DJ who keeps their rate private still appears in the band
 * it falls in, but the response never carries that rate: `published_rate_cents`
 * stays null. A DJ with no rate on file is in no band.
 */

export const BUDGET_BANDS = [
  { key: "under_300", label: "Under $300", min_cents: 0, max_cents: 30_000 },
  { key: "300_to_600", label: "$300–600", min_cents: 30_000, max_cents: 60_000 },
  { key: "600_to_1000", label: "$600–1,000", min_cents: 60_000, max_cents: 100_000 },
  { key: "1000_plus", label: "$1,000+", min_cents: 100_000, max_cents: null },
] as const satisfies ReadonlyArray<{ key: string; label: string; min_cents: number; max_cents: number | null }>;

export type BudgetBand = (typeof BUDGET_BANDS)[number]["key"];

const KEYS: ReadonlySet<string> = new Set(BUDGET_BANDS.map((band) => band.key));

export function isBudgetBand(value: unknown): value is BudgetBand {
  return typeof value === "string" && KEYS.has(value);
}

/** The bands in display order, each once: the canonical `budget` value. */
export function orderBudgetBands(bands: readonly BudgetBand[]): BudgetBand[] {
  const chosen = new Set<string>(bands);
  return BUDGET_BANDS.filter((band) => chosen.has(band.key)).map((band) => band.key);
}
