import { describe, expect, it, vi } from "vitest";
import type { DjCatalogPage, PublicDj } from "@gelatinbookings/partner-sdk/types";
import { listFreeDjs } from "./free-djs";

const dj = (id: string, available: boolean): PublicDj => ({
  id, name: `DJ ${id}`, city: "Atlanta", tier: "verified", profile_url: `https://gelatin.example/djs/${id}`,
  image_url: null, draw: null, genres: [], published_rate_cents: null, available,
});
const page = (items: PublicDj[], next_cursor: string | null = null): DjCatalogPage => ({ items, next_cursor });
const filters = { city: "Atlanta", genre: "House", budget: ["300_to_600" as const] };

// Once a night is picked, the picker lists only the DJs free then.
describe("listFreeDjs", () => {
  it("asks Gelatin for only the DJs free that night, with the organizer's filters", async () => {
    const listDjs = vi.fn(async () => page([dj("a", true)], "next"));
    const result = await listFreeDjs({ listDjs }, { ...filters, date: "2026-11-14", cursor: "c1" });
    expect(listDjs).toHaveBeenCalledTimes(1);
    expect(listDjs).toHaveBeenCalledWith({ ...filters, date: "2026-11-14", available: true, cursor: "c1", limit: 25 });
    expect(result).toEqual({ page: page([dj("a", true)], "next"), allBooked: false });
  });

  it("never shows a DJ Gelatin says is not free, even from an API that ignores the filter", async () => {
    const listDjs = vi.fn(async () => page([dj("a", false), dj("b", true)]));
    const result = await listFreeDjs({ listDjs }, { ...filters, date: "2026-11-14" });
    expect(result.page.items.map((item) => item.id)).toEqual(["b"]);
  });

  it("tells a night where everyone matching is booked from filters no DJ matches", async () => {
    const booked = vi.fn().mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([dj("a", false)]));
    expect(await listFreeDjs({ listDjs: booked }, { ...filters, date: "2026-11-14" })).toEqual({ page: page([]), allBooked: true });
    // The second read drops the night and asks for one DJ: does anyone match at all?
    expect(booked).toHaveBeenLastCalledWith({ ...filters, limit: 1 });

    const nobody = vi.fn().mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([]));
    expect(await listFreeDjs({ listDjs: nobody }, { ...filters, date: "2026-11-14" })).toEqual({ page: page([]), allBooked: false });
  });

  it("only asks the second question on the first page, and treats its failure as unknown", async () => {
    const later = vi.fn(async () => page([]));
    await listFreeDjs({ listDjs: later }, { ...filters, date: "2026-11-14", cursor: "c2" });
    expect(later).toHaveBeenCalledTimes(1);

    const failing = vi.fn().mockResolvedValueOnce(page([])).mockRejectedValueOnce(new Error("down"));
    expect(await listFreeDjs({ listDjs: failing }, { ...filters, date: "2026-11-14" })).toEqual({ page: page([]), allBooked: false });
  });
});
