import { describe, expect, it } from "vitest";
import type { CityDirectory } from "@gelatinbookings/partner-sdk/types";
import { cityFromAddress, cityWithNoDjs } from "./city-choice";

describe("cityWithNoDjs", () => {
  const directory: CityDirectory = { countries: [
    { code: "US", name: "United States", regions: [{ code: "ID", name: "Idaho", cities: [
      { name: "Boise", label: "Boise, ID", dj_count: 0 }, { name: "Meridian", label: "Meridian, ID", dj_count: 2 },
    ] }] },
    { code: null, name: "Other", regions: [{ code: null, name: "Other", cities: [{ name: "Nowhere", label: "Nowhere", dj_count: 0 }] }] },
  ] };

  it("finds a listed US city with no DJs, in any case", () => {
    expect(cityWithNoDjs(directory, "boise, id")).toEqual({ name: "Boise", label: "Boise, ID", dj_count: 0 });
  });

  it("offers nothing for a city with DJs, an unplaced city, no city, or no directory", () => {
    expect(cityWithNoDjs(directory, "Meridian, ID")).toBeNull();
    expect(cityWithNoDjs(directory, "Nowhere")).toBeNull();
    expect(cityWithNoDjs(directory, "")).toBeNull();
    expect(cityWithNoDjs(null, "Boise, ID")).toBeNull();
  });
});

describe("cityFromAddress", () => {
  it("reads the city and state from a US street address", () => {
    expect(cityFromAddress("101 Example Ave, Atlanta, GA 30303")).toBe("Atlanta, GA");
    expect(cityFromAddress("9 Pier Rd, New York, ny 10001-1234")).toBe("New York, NY");
    expect(cityFromAddress("1 Main St, Savannah, GA")).toBe("Savannah, GA");
  });

  it("knows nothing from an address without a city and state", () => {
    expect(cityFromAddress("")).toBeNull();
    expect(cityFromAddress("The Copper Room")).toBeNull();
    expect(cityFromAddress("101 Example Ave, Atlanta")).toBeNull();
    expect(cityFromAddress("10 Downing St, London, SW1A 2AA")).toBeNull();
  });
});
