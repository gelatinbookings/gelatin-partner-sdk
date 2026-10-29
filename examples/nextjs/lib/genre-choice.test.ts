import { describe, expect, it } from "vitest";
import { genreForCity } from "./genre-choice";

const savannah = { genres: [{ name: "Deep House", dj_count: 2 }, { name: "Afrobeats", dj_count: 1 }] };

describe("genre when the city changes", () => {
  it("keeps a genre the new city has, in that city's spelling", () => {
    expect(genreForCity("deep-house", savannah, "Savannah, GA")).toEqual({ genre: "Deep House", notice: null });
  });

  it("drops a genre the new city lacks and says why", () => {
    expect(genreForCity("Techno", savannah, "Savannah, GA")).toEqual({
      genre: "", notice: "No DJs in Savannah, GA list “Techno”, so the genre filter was cleared.",
    });
    expect(genreForCity("Techno", { genres: [] }, "").notice).toContain("any city");
  });

  it("has nothing to do without a picked genre", () => {
    expect(genreForCity("", savannah, "Savannah, GA")).toEqual({ genre: "", notice: null });
  });
});
