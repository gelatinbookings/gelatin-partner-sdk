import { isBudgetBand, orderBudgetBands, type BudgetBand } from "@gelatinbookings/partner-sdk/budget";
import type { PublicDj } from "@gelatinbookings/partner-sdk/types";

/** The ticked budget checkboxes (`?budget=a&budget=b`): known bands only, each once, in band order. */
export function budgetFromSearch(value: string | string[] | undefined): BudgetBand[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return orderBudgetBands(values.filter(isBudgetBand));
}

/** One DJ card in the picker, already reduced to what the page may show. */
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
  drawLabel: string;
  profileUrl: string | null;
  /** Up to six, as Gelatin ordered them; empty when the DJ lists none. */
  genres: string[];
};

const TIERS: Record<string, string> = {
  verified: "Verified", top_performer: "Top performer", resident: "Resident", city_pillar: "City pillar",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DJ";
}

/** "Draw 150–205 · avg 172 · last 90 days": the range Gelatin verified, its average and its window. */
function drawLabel(draw: PublicDj["draw"]): string {
  if (!draw) return "Draw not yet established";
  return [`Draw ${draw.min}–${draw.max}`, draw.avg === null ? null : `avg ${draw.avg}`, draw.window].filter(Boolean).join(" · ");
}

/**
 * Gelatin's display rules for a catalog DJ. A tier the demo doesn't know is
 * shown as sent, never upgraded to a badge; a null rate shows no price; a null
 * draw is "not yet established", never 0.
 */
export function toCatalogDj(dj: PublicDj): CatalogDj {
  return {
    id: dj.id,
    name: dj.name,
    city: dj.city,
    tier: TIERS[dj.tier] ?? dj.tier,
    initials: initials(dj.name),
    // Show only https images and links from Gelatin.
    imageUrl: dj.image_url && dj.image_url.startsWith("https://") ? dj.image_url : null,
    available: dj.available,
    rateDollars: dj.published_rate_cents === null ? null : Math.round(dj.published_rate_cents / 100),
    drawLabel: drawLabel(dj.draw),
    profileUrl: dj.profile_url.startsWith("https://") ? dj.profile_url : null,
    genres: (dj.genres ?? []).slice(0, 6),
  };
}
