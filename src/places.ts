/**
 * Where an organizer can look for talent: every US state plus DC, and the
 * country's major cities with their state. Static data, so a partner can show
 * the whole list before (or without) asking Gelatin. `listCities()` returns the
 * same list with this partner's DJ counts merged in.
 *
 * Source: U.S. Census Bureau, Vintage 2024 population estimates for incorporated
 * places (sub-est2024.csv, public domain). "Major" means the 200 most populous
 * places (each over about 140,000 people) plus the most populous place in every
 * state, so each state has at least one city. Within a state, cities are listed
 * largest first. Names drop the Census suffix ("Atlanta city" → "Atlanta").
 * Each point is the place's internal point from the Census 2024 Gazetteer
 * (2024_Gaz_place_national, also public domain). Gelatin finds DJs whose
 * service radius covers that point, so a city with no local DJs can still
 * count the ones who travel there.
 */

import type { CityDirectory, DirectoryCity, DirectoryRegion } from "./types.js";

export const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
} as const satisfies Record<string, string>;

export type UsStateCode = keyof typeof US_STATES;

/** A city's Census internal point, to four decimals (about 11 m). */
export interface UsCity {
  name: string;
  lat: number;
  lng: number;
}

export const US_MAJOR_CITIES: Readonly<Record<UsStateCode, readonly UsCity[]>> = {
  AK: [
    { name: "Anchorage", lat: 61.1743, lng: -149.2843 },
  ],
  AL: [
    { name: "Huntsville", lat: 34.6977, lng: -86.6767 },
    { name: "Mobile", lat: 30.6682, lng: -88.1079 },
    { name: "Birmingham", lat: 33.5272, lng: -86.797 },
    { name: "Montgomery", lat: 32.3485, lng: -86.2673 },
  ],
  AR: [
    { name: "Little Rock", lat: 34.7254, lng: -92.3586 },
  ],
  AZ: [
    { name: "Phoenix", lat: 33.5722, lng: -112.0901 },
    { name: "Tucson", lat: 32.153, lng: -110.8708 },
    { name: "Mesa", lat: 33.4006, lng: -111.7165 },
    { name: "Gilbert", lat: 33.3103, lng: -111.7431 },
    { name: "Chandler", lat: 33.2828, lng: -111.8518 },
    { name: "Glendale", lat: 33.5331, lng: -112.1899 },
    { name: "Scottsdale", lat: 33.6843, lng: -111.8614 },
    { name: "Peoria", lat: 33.7862, lng: -112.308 },
    { name: "Tempe", lat: 33.3884, lng: -111.9318 },
    { name: "Surprise", lat: 33.6708, lng: -112.4525 },
  ],
  CA: [
    { name: "Los Angeles", lat: 34.0194, lng: -118.4108 },
    { name: "San Diego", lat: 32.815, lng: -117.1356 },
    { name: "San Jose", lat: 37.296, lng: -121.8146 },
    { name: "San Francisco", lat: 37.7272, lng: -123.0322 },
    { name: "Fresno", lat: 36.7827, lng: -119.7934 },
    { name: "Sacramento", lat: 38.5677, lng: -121.4682 },
    { name: "Long Beach", lat: 33.7808, lng: -118.1682 },
    { name: "Oakland", lat: 37.7698, lng: -122.2257 },
    { name: "Bakersfield", lat: 35.3532, lng: -119.0379 },
    { name: "Anaheim", lat: 33.8555, lng: -117.7587 },
    { name: "Stockton", lat: 37.9766, lng: -121.3086 },
    { name: "Riverside", lat: 33.9381, lng: -117.3932 },
    { name: "Irvine", lat: 33.6784, lng: -117.7713 },
    { name: "Santa Ana", lat: 33.7363, lng: -117.8829 },
    { name: "Chula Vista", lat: 32.6277, lng: -117.0152 },
    { name: "Santa Clarita", lat: 34.4165, lng: -118.5007 },
    { name: "Fremont", lat: 37.4945, lng: -121.9411 },
    { name: "San Bernardino", lat: 34.1411, lng: -117.2946 },
    { name: "Modesto", lat: 37.6375, lng: -121.003 },
    { name: "Fontana", lat: 34.1097, lng: -117.4629 },
    { name: "Moreno Valley", lat: 33.9233, lng: -117.2057 },
    { name: "Oxnard", lat: 34.1994, lng: -119.2075 },
    { name: "Huntington Beach", lat: 33.698, lng: -118.0038 },
    { name: "Glendale", lat: 34.1814, lng: -118.2458 },
    { name: "Ontario", lat: 34.0376, lng: -117.6044 },
    { name: "Elk Grove", lat: 38.4146, lng: -121.385 },
    { name: "Santa Rosa", lat: 38.4458, lng: -122.7062 },
    { name: "Rancho Cucamonga", lat: 34.1303, lng: -117.5661 },
    { name: "Garden Grove", lat: 33.7788, lng: -117.9605 },
    { name: "Oceanside", lat: 33.2246, lng: -117.3063 },
    { name: "Lancaster", lat: 34.6936, lng: -118.1753 },
    { name: "Roseville", lat: 38.7703, lng: -121.3196 },
    { name: "Palmdale", lat: 34.591, lng: -118.1054 },
    { name: "Corona", lat: 33.862, lng: -117.5655 },
    { name: "Salinas", lat: 36.6902, lng: -121.6338 },
    { name: "Hayward", lat: 37.6268, lng: -122.104 },
    { name: "Sunnyvale", lat: 37.3858, lng: -122.0263 },
    { name: "Escondido", lat: 33.1331, lng: -117.074 },
    { name: "Pomona", lat: 34.0585, lng: -117.7611 },
    { name: "Visalia", lat: 36.328, lng: -119.3285 },
    { name: "Victorville", lat: 34.5277, lng: -117.3536 },
  ],
  CO: [
    { name: "Denver", lat: 39.7619, lng: -104.8811 },
    { name: "Colorado Springs", lat: 38.8673, lng: -104.7607 },
    { name: "Aurora", lat: 39.7095, lng: -104.7205 },
    { name: "Fort Collins", lat: 40.5482, lng: -105.0648 },
    { name: "Lakewood", lat: 39.6989, lng: -105.1176 },
    { name: "Thornton", lat: 39.9204, lng: -104.9414 },
  ],
  CT: [
    { name: "Bridgeport", lat: 41.1874, lng: -73.1958 },
  ],
  DC: [
    { name: "Washington", lat: 38.9042, lng: -77.0165 },
  ],
  DE: [
    { name: "Wilmington", lat: 39.7357, lng: -75.5321 },
  ],
  FL: [
    { name: "Jacksonville", lat: 30.3369, lng: -81.6616 },
    { name: "Miami", lat: 25.7752, lng: -80.2086 },
    { name: "Tampa", lat: 27.9701, lng: -82.4797 },
    { name: "Orlando", lat: 28.4087, lng: -81.2548 },
    { name: "St. Petersburg", lat: 27.7627, lng: -82.6441 },
    { name: "Port St. Lucie", lat: 27.2806, lng: -80.3883 },
    { name: "Hialeah", lat: 25.8699, lng: -80.3029 },
    { name: "Cape Coral", lat: 26.6432, lng: -81.9974 },
    { name: "Tallahassee", lat: 30.4535, lng: -84.2523 },
    { name: "Fort Lauderdale", lat: 26.1412, lng: -80.1467 },
    { name: "Pembroke Pines", lat: 26.0147, lng: -80.3402 },
    { name: "Hollywood", lat: 26.031, lng: -80.1646 },
    { name: "Gainesville", lat: 29.6795, lng: -82.3468 },
    { name: "Miramar", lat: 25.9725, lng: -80.3386 },
    { name: "Palm Bay", lat: 27.9548, lng: -80.665 },
    { name: "Coral Springs", lat: 26.2707, lng: -80.2593 },
  ],
  GA: [
    { name: "Atlanta", lat: 33.7629, lng: -84.4227 },
    { name: "Columbus", lat: 32.5102, lng: -84.8749 },
    { name: "Augusta", lat: 33.3655, lng: -82.0734 },
    { name: "Macon", lat: 32.809, lng: -83.6941 },
    { name: "Savannah", lat: 32.018, lng: -81.1965 },
  ],
  HI: [
    { name: "Honolulu", lat: 21.3243, lng: -157.8476 },
  ],
  IA: [
    { name: "Des Moines", lat: 41.5726, lng: -93.6102 },
  ],
  ID: [
    { name: "Boise", lat: 43.5993, lng: -116.2298 },
  ],
  IL: [
    { name: "Chicago", lat: 41.837, lng: -87.6849 },
    { name: "Aurora", lat: 41.7635, lng: -88.2901 },
    { name: "Naperville", lat: 41.7492, lng: -88.162 },
    { name: "Joliet", lat: 41.5169, lng: -88.148 },
    { name: "Rockford", lat: 42.2593, lng: -89.0635 },
  ],
  IN: [
    { name: "Indianapolis", lat: 39.7767, lng: -86.1459 },
    { name: "Fort Wayne", lat: 41.0882, lng: -85.1428 },
  ],
  KS: [
    { name: "Wichita", lat: 37.6906, lng: -97.3458 },
    { name: "Overland Park", lat: 38.889, lng: -94.6906 },
    { name: "Kansas City", lat: 39.1225, lng: -94.7418 },
    { name: "Olathe", lat: 38.882, lng: -94.8201 },
  ],
  KY: [
    { name: "Louisville", lat: 38.1654, lng: -85.6474 },
    { name: "Lexington", lat: 38.0407, lng: -84.4583 },
  ],
  LA: [
    { name: "New Orleans", lat: 30.0534, lng: -89.9345 },
    { name: "Baton Rouge", lat: 30.4404, lng: -91.1332 },
    { name: "Shreveport", lat: 32.4669, lng: -93.7922 },
  ],
  MA: [
    { name: "Boston", lat: 42.3386, lng: -71.0183 },
    { name: "Worcester", lat: 42.2695, lng: -71.8078 },
    { name: "Springfield", lat: 42.1155, lng: -72.54 },
  ],
  MD: [
    { name: "Baltimore", lat: 39.3, lng: -76.6105 },
  ],
  ME: [
    { name: "Portland", lat: 43.6332, lng: -70.1853 },
  ],
  MI: [
    { name: "Detroit", lat: 42.383, lng: -83.1022 },
    { name: "Grand Rapids", lat: 42.9612, lng: -85.6556 },
  ],
  MN: [
    { name: "Minneapolis", lat: 44.9633, lng: -93.2683 },
    { name: "St. Paul", lat: 44.9489, lng: -93.1041 },
  ],
  MO: [
    { name: "Kansas City", lat: 39.1252, lng: -94.5503 },
    { name: "St. Louis", lat: 38.6357, lng: -90.2446 },
    { name: "Springfield", lat: 37.1942, lng: -93.2926 },
  ],
  MS: [
    { name: "Jackson", lat: 32.3158, lng: -90.2129 },
  ],
  MT: [
    { name: "Billings", lat: 45.7885, lng: -108.5525 },
  ],
  NC: [
    { name: "Charlotte", lat: 35.209, lng: -80.831 },
    { name: "Raleigh", lat: 35.8319, lng: -78.641 },
    { name: "Greensboro", lat: 36.0949, lng: -79.8236 },
    { name: "Durham", lat: 35.9779, lng: -78.8981 },
    { name: "Winston-Salem", lat: 36.1029, lng: -80.2608 },
    { name: "Fayetteville", lat: 35.0828, lng: -78.9735 },
    { name: "Cary", lat: 35.7813, lng: -78.8234 },
  ],
  ND: [
    { name: "Fargo", lat: 46.8647, lng: -96.8291 },
  ],
  NE: [
    { name: "Omaha", lat: 41.2627, lng: -96.0535 },
    { name: "Lincoln", lat: 40.8103, lng: -96.6749 },
  ],
  NH: [
    { name: "Manchester", lat: 42.9849, lng: -71.4441 },
  ],
  NJ: [
    { name: "Newark", lat: 40.7242, lng: -74.1726 },
    { name: "Jersey City", lat: 40.7114, lng: -74.0648 },
    { name: "Paterson", lat: 40.9148, lng: -74.1628 },
  ],
  NM: [
    { name: "Albuquerque", lat: 35.1048, lng: -106.6468 },
  ],
  NV: [
    { name: "Las Vegas", lat: 36.2335, lng: -115.264 },
    { name: "Henderson", lat: 36.009, lng: -115.0268 },
    { name: "North Las Vegas", lat: 36.2899, lng: -115.0892 },
    { name: "Reno", lat: 39.5491, lng: -119.8499 },
  ],
  NY: [
    { name: "New York", lat: 40.6627, lng: -73.9387 },
    { name: "Buffalo", lat: 42.8925, lng: -78.8597 },
    { name: "Yonkers", lat: 40.9459, lng: -73.8674 },
    { name: "Rochester", lat: 43.1699, lng: -77.6169 },
    { name: "Syracuse", lat: 43.041, lng: -76.1436 },
  ],
  OH: [
    { name: "Columbus", lat: 39.9839, lng: -82.9849 },
    { name: "Cleveland", lat: 41.4785, lng: -81.6794 },
    { name: "Cincinnati", lat: 39.1402, lng: -84.5058 },
    { name: "Toledo", lat: 41.6641, lng: -83.5819 },
    { name: "Akron", lat: 41.0805, lng: -81.5214 },
  ],
  OK: [
    { name: "Oklahoma City", lat: 35.4671, lng: -97.5137 },
    { name: "Tulsa", lat: 36.1279, lng: -95.9023 },
  ],
  OR: [
    { name: "Portland", lat: 45.537, lng: -122.65 },
    { name: "Salem", lat: 44.9239, lng: -123.023 },
    { name: "Eugene", lat: 44.0568, lng: -123.119 },
  ],
  PA: [
    { name: "Philadelphia", lat: 40.0094, lng: -75.1333 },
    { name: "Pittsburgh", lat: 40.4399, lng: -79.9757 },
  ],
  RI: [
    { name: "Providence", lat: 41.8231, lng: -71.4188 },
  ],
  SC: [
    { name: "Charleston", lat: 32.828, lng: -79.9729 },
    { name: "Columbia", lat: 34.0405, lng: -80.9061 },
  ],
  SD: [
    { name: "Sioux Falls", lat: 43.5407, lng: -96.732 },
  ],
  TN: [
    { name: "Nashville", lat: 36.1718, lng: -86.785 },
    { name: "Memphis", lat: 35.1092, lng: -89.9685 },
    { name: "Knoxville", lat: 35.9707, lng: -83.9493 },
    { name: "Chattanooga", lat: 35.066, lng: -85.2484 },
    { name: "Clarksville", lat: 36.5664, lng: -87.3452 },
    { name: "Murfreesboro", lat: 35.8539, lng: -86.4212 },
  ],
  TX: [
    { name: "Houston", lat: 29.7857, lng: -95.3888 },
    { name: "San Antonio", lat: 29.4628, lng: -98.5246 },
    { name: "Dallas", lat: 32.7933, lng: -96.7665 },
    { name: "Fort Worth", lat: 32.782, lng: -97.3486 },
    { name: "Austin", lat: 30.2986, lng: -97.7541 },
    { name: "El Paso", lat: 31.8478, lng: -106.4311 },
    { name: "Arlington", lat: 32.7007, lng: -97.1247 },
    { name: "Corpus Christi", lat: 27.7543, lng: -97.1734 },
    { name: "Plano", lat: 33.0508, lng: -96.7479 },
    { name: "Lubbock", lat: 33.5619, lng: -101.8889 },
    { name: "Laredo", lat: 27.5604, lng: -99.4892 },
    { name: "Irving", lat: 32.8577, lng: -96.97 },
    { name: "Garland", lat: 32.9098, lng: -96.6303 },
    { name: "Frisco", lat: 33.1554, lng: -96.8226 },
    { name: "McKinney", lat: 33.2011, lng: -96.6642 },
    { name: "Grand Prairie", lat: 32.6861, lng: -97.0208 },
    { name: "Amarillo", lat: 35.1981, lng: -101.8331 },
    { name: "Brownsville", lat: 25.9957, lng: -97.4508 },
    { name: "Denton", lat: 33.2174, lng: -97.1413 },
    { name: "Killeen", lat: 31.0777, lng: -97.732 },
    { name: "Mesquite", lat: 32.7595, lng: -96.5842 },
    { name: "Pasadena", lat: 29.655, lng: -95.1511 },
    { name: "McAllen", lat: 26.225, lng: -98.2461 },
    { name: "Waco", lat: 31.558, lng: -97.1898 },
    { name: "Midland", lat: 32.0246, lng: -102.1135 },
  ],
  UT: [
    { name: "Salt Lake City", lat: 40.7769, lng: -111.931 },
  ],
  VA: [
    { name: "Virginia Beach", lat: 36.7795, lng: -76.0291 },
    { name: "Chesapeake", lat: 36.6794, lng: -76.3018 },
    { name: "Richmond", lat: 37.5314, lng: -77.476 },
    { name: "Norfolk", lat: 36.923, lng: -76.2446 },
    { name: "Newport News", lat: 37.0761, lng: -76.522 },
    { name: "Alexandria", lat: 38.8193, lng: -77.0837 },
  ],
  VT: [
    { name: "Burlington", lat: 44.4919, lng: -73.2389 },
  ],
  WA: [
    { name: "Seattle", lat: 47.6193, lng: -122.3515 },
    { name: "Spokane", lat: 47.6669, lng: -117.4333 },
    { name: "Tacoma", lat: 47.2522, lng: -122.4598 },
    { name: "Vancouver", lat: 45.6372, lng: -122.5966 },
    { name: "Bellevue", lat: 47.5978, lng: -122.1565 },
  ],
  WI: [
    { name: "Milwaukee", lat: 43.0633, lng: -87.9667 },
    { name: "Madison", lat: 43.0878, lng: -89.4299 },
  ],
  WV: [
    { name: "Charleston", lat: 38.3487, lng: -81.6323 },
  ],
  WY: [
    { name: "Cheyenne", lat: 41.1287, lng: -104.7908 },
  ],
};

/** How a city is written everywhere: `"Atlanta, GA"`. Pass it as `listDjs({ city })`. */
export function cityLabel(name: string, state: string): string {
  return `${name}, ${state}`;
}

/**
 * The city of a US street address, as a `listCities` label: "101 Example Ave,
 * Atlanta, GA 30303" gives "Atlanta, GA". Null when the address does not end
 * in a city and a state code, so nothing is guessed.
 */
export function cityFromAddress(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const state = /^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/.exec(parts[parts.length - 1])?.[1].toUpperCase();
  if (!state || !Object.hasOwn(US_STATES, state)) return null;
  return cityLabel(parts[parts.length - 2], state);
}

const words = (value: string) => value.toLowerCase().split(/[\s,.-]+/).filter(Boolean);

/**
 * Narrows a directory the way Gelatin's picker does. A query matches a city by
 * the start of any word in its name ("san" finds San Diego and San Jose), and
 * matches every city in a state by its code or name ("GA", "georgia") or in a
 * country by its code or name ("US"). A state matched as a whole is listed
 * before states that only have a city starting with the query, so "GA" puts
 * Georgia ahead of Garden Grove. Groups left empty by the query are dropped.
 * An empty query returns the directory unchanged.
 */
export function filterCityDirectory(directory: CityDirectory, query: string): CityDirectory {
  const q = query.trim().toLowerCase();
  if (!q) return directory;
  const prefix = (value: string) => value.toLowerCase().startsWith(q);
  const cityMatches = (city: DirectoryCity) => prefix(city.label) || words(city.name).some(prefix);
  return {
    countries: directory.countries.flatMap((country) => {
      const wholeCountry = country.code !== null && (country.code.toLowerCase() === q || prefix(country.name));
      const whole: DirectoryRegion[] = [];
      const partial: DirectoryRegion[] = [];
      for (const region of country.regions) {
        if (!wholeCountry && region.code !== null && (region.code.toLowerCase() === q || prefix(region.name))) {
          whole.push(region);
          continue;
        }
        const cities = wholeCountry ? region.cities : region.cities.filter(cityMatches);
        if (cities.length) partial.push({ ...region, cities });
      }
      const regions = [...whole, ...partial];
      return regions.length ? [{ ...country, regions }] : [];
    }),
  };
}
