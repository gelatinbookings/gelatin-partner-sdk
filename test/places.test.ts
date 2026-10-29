import { describe, expect, it, vi } from "vitest";
import { cityLabel, filterCityDirectory, US_MAJOR_CITIES, US_STATES } from "../src/places.js";
import { createPartnerClient } from "../src/server.js";
import type { CityDirectory } from "../src/types.js";

const directory: CityDirectory = {
  countries: [
    { code: "US", name: "United States", regions: [
      { code: "GA", name: "Georgia", cities: [
        { name: "Atlanta", label: "Atlanta, GA", dj_count: 6 },
        { name: "Savannah", label: "Savannah, GA", dj_count: 0 },
      ] },
      { code: "IL", name: "Illinois", cities: [{ name: "Chicago", label: "Chicago, IL", dj_count: 1 }] },
      { code: "TX", name: "Texas", cities: [
        { name: "Garland", label: "Garland, TX", dj_count: 0 },
        { name: "San Antonio", label: "San Antonio, TX", dj_count: 2 },
      ] },
    ] },
    { code: null, name: "Other", regions: [{ code: null, name: "Other", cities: [{ name: "London", label: "London, England", dj_count: 1 }] }] },
  ],
};

const labels = (result: CityDirectory) => result.countries.flatMap((country) => country.regions.flatMap((region) => region.cities.map((city) => city.label)));

describe("bundled US places", () => {
  it("covers every state plus DC, each with at least one major city", () => {
    expect(Object.keys(US_STATES)).toHaveLength(51);
    for (const code of Object.keys(US_STATES)) {
      expect(US_MAJOR_CITIES[code as keyof typeof US_STATES].length, code).toBeGreaterThan(0);
    }
    expect(US_MAJOR_CITIES.GA.map((city) => city.name)).toEqual(expect.arrayContaining(["Atlanta", "Savannah"]));
    expect(cityLabel("Atlanta", "GA")).toBe("Atlanta, GA");
  });

  it("names cities without Census suffixes and without duplicates in a state", () => {
    for (const [state, cities] of Object.entries(US_MAJOR_CITIES)) {
      const names = cities.map((city) => city.name);
      expect(new Set(names).size, state).toBe(names.length);
      for (const name of names) expect(name).not.toMatch(/\b(city|town|CDP|balance|government|county)\b/);
    }
  });

  it("gives every city a point inside the United States", () => {
    for (const [state, cities] of Object.entries(US_MAJOR_CITIES)) {
      for (const city of cities) {
        expect(city.lat, `${city.name}, ${state}`).toBeGreaterThan(18);
        expect(city.lat, `${city.name}, ${state}`).toBeLessThan(72);
        expect(city.lng, `${city.name}, ${state}`).toBeGreaterThan(-180);
        expect(city.lng, `${city.name}, ${state}`).toBeLessThan(-66);
      }
    }
    expect(US_MAJOR_CITIES.GA.find((city) => city.name === "Atlanta")).toEqual({ name: "Atlanta", lat: 33.7629, lng: -84.4227 });
  });
});

describe("filterCityDirectory", () => {
  it("returns everything for an empty query", () => {
    expect(filterCityDirectory(directory, "  ")).toBe(directory);
  });

  it("matches every city in a state by its code or name", () => {
    // The whole state comes first; cities whose name starts with the query follow.
    expect(labels(filterCityDirectory(directory, "GA"))).toEqual(["Atlanta, GA", "Savannah, GA", "Garland, TX"]);
    expect(labels(filterCityDirectory(directory, "georg"))).toEqual(["Atlanta, GA", "Savannah, GA"]);
  });

  it("lists a state matched by its code ahead of states that only have a city starting with it", () => {
    const withCalifornia: CityDirectory = { countries: [{ ...directory.countries[0], regions: [
      { code: "CA", name: "California", cities: [{ name: "Garden Grove", label: "Garden Grove, CA", dj_count: 0 }] },
      ...directory.countries[0].regions,
    ] }] };
    expect(labels(filterCityDirectory(withCalifornia, "ga"))).toEqual(["Atlanta, GA", "Savannah, GA", "Garden Grove, CA", "Garland, TX"]);
  });

  it("matches every city in a country by its code", () => {
    expect(labels(filterCityDirectory(directory, "us"))).toEqual(["Atlanta, GA", "Savannah, GA", "Chicago, IL", "Garland, TX", "San Antonio, TX"]);
  });

  it("matches a city by the start of any word, keeping zero-talent cities", () => {
    expect(labels(filterCityDirectory(directory, "anton"))).toEqual(["San Antonio, TX"]);
    expect(labels(filterCityDirectory(directory, "sav"))).toEqual(["Savannah, GA"]);
    expect(labels(filterCityDirectory(directory, "london"))).toEqual(["London, England"]);
    expect(labels(filterCityDirectory(directory, "zzz"))).toEqual([]);
  });

  it("drops groups the query leaves empty", () => {
    const result = filterCityDirectory(directory, "chicago");
    expect(result.countries).toHaveLength(1);
    expect(result.countries[0].regions.map((region) => region.code)).toEqual(["IL"]);
  });
});

describe("listCities", () => {
  const client = (body: unknown) => {
    const fetcher = vi.fn(async () => Response.json(body)) as unknown as typeof fetch;
    return { fetcher, client: createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher }) };
  };

  it("reads the directory from the partner's cities route, keeping only public fields", async () => {
    const { fetcher, client: gelatin } = client({ countries: [{ code: "US", name: "United States", private_note: "x", regions: [
      { code: "GA", name: "Georgia", cities: [{ name: "Atlanta", label: "Atlanta, GA", dj_count: 6, dj_ids: ["secret"] }] },
    ] }] });
    const result = await gelatin.listCities();
    expect(result).toEqual({ countries: [{ code: "US", name: "United States", regions: [
      { code: "GA", name: "Georgia", cities: [{ name: "Atlanta", label: "Atlanta, GA", dj_count: 6 }] },
    ] }] });
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.gelatin.example/v1/partners/acme/cities");
    expect(init.method).toBe("GET");
  });

  it.each([
    { countries: "nope" },
    { countries: [{ code: 1, name: "US", regions: [] }] },
    { countries: [{ code: "US", name: "United States", regions: [{ code: "GA", name: "Georgia", cities: [{ name: "Atlanta", label: "Atlanta, GA", dj_count: -1 }] }] }] },
    { countries: [{ code: "US", name: "United States", regions: [{ code: "GA", name: "Georgia", cities: [{ name: "Atlanta", label: "Atlanta, GA", dj_count: 1.5 }] }] }] },
  ])("rejects a malformed directory %#", async (body) => {
    await expect(client(body).client.listCities()).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("joinCityWaitlist", () => {
  const client = (body: unknown, status = 201) => {
    const fetcher = vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;
    return { fetcher, client: createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher }) };
  };
  const city = { name: "Boise", region: "ID", label: "Boise, ID" };

  it("posts the organizer's ask to the partner's city-waitlist route with an idempotency key", async () => {
    const { fetcher, client: gelatin } = client({ status: "subscribed", city, email: "never-read@example.test" });
    const result = await gelatin.joinCityWaitlist({ email: "organizer@example.test", city: "Boise, ID", consent: true, source: "empty_state" });
    expect(result).toEqual({ status: "subscribed", city });
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.gelatin.example/v1/partners/acme/city-waitlist");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/.+/);
    expect(JSON.parse(String(init.body))).toEqual({ email: "organizer@example.test", city: "Boise, ID", consent: true, source: "empty_state" });
  });

  it("reads a repeat as already_subscribed", async () => {
    expect(await client({ status: "already_subscribed", city }, 200).client.joinCityWaitlist({ email: "a@b.test", city: "Boise, ID", consent: true }))
      .toEqual({ status: "already_subscribed", city });
  });

  it.each([{ status: "maybe", city }, { status: "subscribed" }, { status: "subscribed", city: { name: "Boise" } }])("rejects a malformed answer %#", async (body) => {
    await expect(client(body).client.joinCityWaitlist({ email: "a@b.test", city: "Boise, ID", consent: true })).rejects.toMatchObject({ code: "invalid_response" });
  });
});
