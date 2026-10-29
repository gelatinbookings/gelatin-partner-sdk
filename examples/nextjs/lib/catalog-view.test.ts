import { describe, expect, it } from "vitest";
import type { PublicDj } from "@gelatinbookings/partner-sdk/types";
import { budgetFromSearch, toCatalogDj } from "./catalog-view";

const dj = (overrides: Partial<PublicDj> = {}): PublicDj => ({
  id: "dj_1", name: "Synthetic DJ", city: "Atlanta", tier: "verified",
  profile_url: "https://gelatin.example/djs/synthetic-dj", image_url: null,
  draw: null, genres: [], published_rate_cents: null, available: true,
  ...overrides,
});

describe("catalog card display rules", () => {
  it("labels the tiers Gelatin defines", () => {
    expect(toCatalogDj(dj({ tier: "top_performer" })).tier).toBe("Top performer");
    expect(toCatalogDj(dj({ tier: "city_pillar" })).tier).toBe("City pillar");
  });

  it("passes an unknown tier through rather than inventing a badge", () => {
    // A tier Gelatin adds later must not read as "Verified" on a partner page.
    const unknown = toCatalogDj(dj({ tier: "headliner" as PublicDj["tier"] }));
    expect(unknown.tier).toBe("headliner");
  });

  it("shows no price at all when the rate is null, and never $0", () => {
    expect(toCatalogDj(dj({ published_rate_cents: null })).rateDollars).toBeNull();
    expect(toCatalogDj(dj({ published_rate_cents: 0 })).rateDollars).toBe(0);
    expect(toCatalogDj(dj({ published_rate_cents: 45_049 })).rateDollars).toBe(450);
  });

  it("says a missing draw is not yet established, never 0", () => {
    expect(toCatalogDj(dj({ draw: null })).drawLabel).toBe("Draw not yet established");
    expect(toCatalogDj(dj({ draw: { min: 80, max: 150, avg: 112, window: "last 90 days" } })).drawLabel).toBe("Draw 80–150 · avg 112 · last 90 days");
    expect(toCatalogDj(dj({ draw: { min: 80, max: 150, avg: null, window: "last 90 days" } })).drawLabel).toBe("Draw 80–150 · last 90 days");
  });

  it("keeps only https images and profile links", () => {
    expect(toCatalogDj(dj({ image_url: "http://insecure.example/dj.jpg", profile_url: "javascript:alert(1)" }))).toMatchObject({ imageUrl: null, profileUrl: null });
    expect(toCatalogDj(dj({ image_url: "https://images.example/dj.jpg" })).imageUrl).toBe("https://images.example/dj.jpg");
  });

  it("shows Gelatin's genres in its order, at most six", () => {
    expect(toCatalogDj(dj()).genres).toEqual([]);
    const many = ["House", "Techno", "Disco", "Funk", "Soul", "Jazz", "Garage"];
    expect(toCatalogDj(dj({ genres: many })).genres).toEqual(many.slice(0, 6));
  });

  it("builds initials for a DJ without a photo", () => {
    expect(toCatalogDj(dj({ name: "dj  koyo" })).initials).toBe("DK");
    expect(toCatalogDj(dj({ name: " " })).initials).toBe("DJ");
  });
});

describe("budget from the URL", () => {
  it("keeps known bands once each in band order and drops anything else", () => {
    expect(budgetFromSearch(undefined)).toEqual([]);
    expect(budgetFromSearch("300_to_600")).toEqual(["300_to_600"]);
    expect(budgetFromSearch(["1000_plus", "cheap", "under_300", "1000_plus"])).toEqual(["under_300", "1000_plus"]);
  });
});
