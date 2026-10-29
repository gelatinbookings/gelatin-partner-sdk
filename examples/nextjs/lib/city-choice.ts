import type { CityDirectory, DirectoryCity } from "@gelatinbookings/partner-sdk/types";

/** The event's city from its venue address; shared with Gelatin through the SDK. */
export { cityFromAddress } from "@gelatinbookings/partner-sdk/places";

/**
 * The chosen city when Gelatin lists it with no DJs at all, counting DJs who
 * travel there. Only then is "notify me" offered: a city whose DJs are all
 * booked that night is not empty, just busy.
 */
export function cityWithNoDjs(directory: CityDirectory | null, label: string): DirectoryCity | null {
  if (!directory || !label) return null;
  const wanted = label.trim().toLowerCase();
  for (const country of directory.countries) {
    // Only a city in a US state can be signed up for; Gelatin keeps its state with the email.
    if (country.code !== "US") continue;
    for (const region of country.regions) {
      const city = region.cities.find((item) => item.label.toLowerCase() === wanted);
      if (city) return city.dj_count === 0 ? city : null;
    }
  }
  return null;
}
