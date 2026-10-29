import { describe, expect, it } from "vitest";
import { filterGenres, findGenre, genreKey } from "../src/genres.js";

const directory = { genres: [{ name: "Deep House", dj_count: 4 }, { name: "House", dj_count: 3 }, { name: "Afrobeats", dj_count: 1 }] };

describe("genre helpers", () => {
  it("key genres ignoring case, accents, whitespace and punctuation, with no synonyms", () => {
    expect(genreKey("Deep-House")).toBe(genreKey(" deep  house "));
    expect(genreKey("Música")).toBe("musica");
    expect(genreKey("D&B")).not.toBe(genreKey("Drum and Bass"));
    expect(genreKey("--")).toBe("");
  });

  it("find a picked genre in a city's directory, or nothing to keep", () => {
    expect(findGenre(directory, "deep-house")).toEqual({ name: "Deep House", dj_count: 4 });
    expect(findGenre(directory, "Techno")).toBeNull();
    expect(findGenre(directory, " ")).toBeNull();
  });

  it("filter a typeahead by the same key, busiest first", () => {
    expect(filterGenres(directory, "house").map((genre) => genre.name)).toEqual(["Deep House", "House"]);
    expect(filterGenres(directory, "deep-h").map((genre) => genre.name)).toEqual(["Deep House"]);
    expect(filterGenres(directory, "")).toEqual(directory.genres);
    expect(filterGenres(directory, "polka")).toEqual([]);
  });
});
