# Changelog

## 0.1.0-alpha.5 (proposed, not tagged)

Everything here is additive: no request field became required and no response field was removed or changed type. Code written for alpha.4 keeps working.

### New

- **City picker.** `listCities()` returns every US state's major cities plus any city where you have a DJ, each with `dj_count`. `@gelatinbookings/partner-sdk/places` ships `US_STATES`, `US_MAJOR_CITIES` (U.S. Census Bureau Vintage 2024: the 200 most populous places plus each state's largest, with Gazetteer points), `cityLabel`, `cityFromAddress` and `filterCityDirectory`.
- **"Notify me" for a city with no DJs.** `joinCityWaitlist({ email, city, consent, source })`.
- **Budget filter.** `listDjs({ budget })` with band keys from `@gelatinbookings/partner-sdk/budget` (`BUDGET_BANDS`). DJs who keep their rate private are filtered on their real rate but still show `published_rate_cents: null`.
- **Genres.** Each DJ carries `genres`; `listDjs({ genre })` and `listGenres({ city, budget })`, with `genreKey`, `filterGenres` and `findGenre` in `@gelatinbookings/partner-sdk/genres`.
- **Alternates after a DJ passes.** `listAlternates(eventId, requestId)`.
- **Public lineup.** `getEventLineup(eventId, { includePending, ifNoneMatch })`.
- **Verified draw average.** `draw.avg` alongside `min` and `max`.
- The OpenAPI spec covers all of the above.

### Behaviour changes (same fields, different values)

These came with Gelatin's catalog work. Each is a per-partner setting that defaults to the behaviour below; ask Gelatin to switch it.

- **City matching includes travelling DJs.** `listDjs({ city })` matches other spellings of the city (`"Atlanta"`, `"Atlanta, GA"`, `"Atlanta, Georgia"`) and, for a listed city, DJs whose service radius covers it. Expect more results for large cities. Switchable to exact-name matching.
- **`profile_url` points to a co-branded page.** With a registered portal origin it is `https://<portal origin>/partner/djs/{slug}`; without one it is still Gelatin's profile. Switchable to always use Gelatin's profile.
- **`draw` is populated.** It was always `null` before; it is now an object for DJs with at least one verified night.
- **Alternates on Gelatin's booking page.** After a pass, the page can send the organizer back to your `return_url` with `gelatin_request_id` and `gelatin_offer_dj` (default), show the list only, or let the organizer send the offer to another DJ there.

### Example

`examples/nextjs` adds the city picker, genre and budget filters, a "notify me" form, alternates, a public event page, a warning when a picked DJ is booked meanwhile, "Skip, no lineup right now", and a **Light / Full** switch in the header that shows the minimum integration (Gelatin's portal takes the card hold) next to the full one.
