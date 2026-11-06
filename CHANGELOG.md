# Changelog

## 0.1.0-alpha.10

Additive: every call and field from alpha.9 works as before, and no field was removed or changed type or value. One new call reads the quote to show before the organizer pays.

### New

- **`getEventQuote(eventId)`**: the quote to show before the organizer pays (`EventQuote`). For each DJ still waiting for a hold, it has the DJ fee, the service fee, card processing and the total. It also has the event total, a quote number and valid-until, the payment steps in plain words, the cancellation terms and `terms_url`. Its figures are the ones the hold uses, so show them rather than adding anything up. Needs `bookings:read`; an unknown event, or another partner's, is `404 not_found`.

### Docs

- `PartnerCancellation.refund_cents` is what is refunded from a charge, and zero when only a hold existed. A released hold is not a refund, so show it as released (`hold_released`), never as refunded. No behaviour change.

## 0.1.0-alpha.9

Additive: every call and field from alpha.8 works as before, and no field was removed or changed type or value. Two new calls read one DJ's profile and calendar.

### New

- **`launch_url`** on `createPortalLaunch`'s result: the one-use link to Gelatin's booking page in its root form, `https://<portal origin>/launch#token=…`. Redirect the organizer to this one.
- **`profile_page_url`** on catalog DJs (`listDjs`, alternates) and lineup entries: the DJ's profile in its root form, `https://<portal origin>/djs/{slug}` on your portal origin, or Gelatin's `/djs/{slug}` page.
- Against an older Gelatin server that sends only the old fields, the client fills `launch_url` and `profile_page_url` from `url` and `profile_url`.
- **`getDj(djId)`**: one catalog DJ's full public profile (`PartnerDjDetail`).
  - Fields: bio, gallery, genres, verified draw, published rate, rating, anonymous reviews (words, day and venue), listen links, public socials, upcoming public nights, and `profile_page_url` plus the deprecated `profile_url`.
  - Never contact details: emails, phone numbers and chat links typed into a bio or review come back as `[removed]`.
  - Conditional with `ifNoneMatch`, like `getEventLineup`. A DJ you can't list is `404 not_found`.
- **`getDjAvailability(djId, { from, to, time_zone? })`**: each day `available` or `unavailable`, for up to 90 days, by the catalog's availability rules, never saying why (`DjAvailability`).
- Both refuse an id that isn't a Gelatin DJ ID before sending anything.
- The OpenAPI spec covers both new routes.

### Deprecated

- **`url`** on `createPortalLaunch`'s result and **`profile_url`**: the same pages in their older `/partner/launch` and `/partner/djs/{slug}` forms. They keep working, with no removal date yet: Gelatin redirects each to the root page, keeping the `#token=…`. Marked `@deprecated` in the types and `deprecated` in the OpenAPI spec.

### Changed

- Gelatin's organizer portal now lives at the root of your portal host: `/launch`, `/events`, `/event`, `/djs/{slug}` and so on. Old `/partner/...` addresses redirect there, so links already sent keep working.
- The saved-card consent wording is final. Saved cards still wait on Gelatin's Terms and your agreement before live money.
- `examples/nextjs` reads `launch_url` and `profile_page_url`, and accepts both launch paths.

## 0.1.0-alpha.8

Additive: every call and field from alpha.7 works as before, and no response field was removed or changed type. A server older than this release refuses the new `payment` field with `400 invalid_request` and creates nothing.

### New

- **One checkout for every DJ, on your page (verify on staging).** Gelatin is still checking this end to end in its sandbox, so test it there before you rely on it. It works only when Gelatin has saved cards on for your partner.
  - `submitBookingRequests({ ..., payment: "event_checkout" })` books and returns `event_checkout`: one Stripe checkout for every DJ on the event (`client_secret`, `publishable_key`, `total_cents`, `currency`, `dj_count`). Mount it like a per-DJ checkout. It needs `launch:write` as well as `requests:write`, and a replay returns the same booking and the same open checkout.
  - `createEventPaymentSession({ external_event_id, external_user_id })` opens the same checkout for a booking you already sent.
  - It is a setup checkout: it saves a card for this event, with Gelatin's consent shown inside it, and charges nothing. Gelatin then holds each DJ in the background, each with a receipt email and within the organizer's hold limits. A DJ whose hold the card refused, wanted 3-D Secure for, or was over a limit stays `authorization_required`: create a payment session or a portal launch for them.
  - **A saved card belongs to one event.** Every event gets its own checkout and its own card, even for an organizer who has paid before; one event's card never holds another event's DJs. A DJ added later to an event whose card is saved is held on that card automatically.
  - If it can't open: `409 event_checkout_unavailable` (saved cards aren't on for you; nothing was created), or, with the booking made, `event_checkout_error` with `nothing_to_pay` (every DJ is held or being held on the event's card), `event_checkout_unavailable` (the event's card already refused a DJ who still needs payment: pay that DJ per DJ or through a portal launch) or `temporarily_unavailable`. `createEventPaymentSession` answers the same codes as `409` errors.
  - New types: `EventPaymentSessionRequest`, `EventPaymentSessionResult`, `EventCheckoutError`, and `BookingRequest.payment`.
- **Set times.** `listDjs({ set: { starts_at, ends_at, time_zone } })` answers `available` for the set's window instead of the whole night. Send the same `set_starts_at` and `set_ends_at` on a DJ's request.
- **Lineup detail.** `getEventLineup` entries carry `set_starts_at`, `set_ends_at` and the DJ's `sound` once the DJ is confirmed; they are `null` otherwise, and when talking to an older server.
- **Saved-card receipts and limits.** These are now live. Every saved-card hold emails the organizer a receipt, and Gelatin limits each organizer's new saved-card holds.
- The OpenAPI spec covers all of the above.

### Example

`examples/nextjs` in Full mode has one **Send offers & pay** button. It books and opens one checkout for every DJ on the offer step, then shows each DJ's status. Without saved cards, or against a Gelatin that doesn't offer it yet, it sends the booking again without `payment` and pays per DJ.

## 0.1.0-alpha.7

Additive for existing callers: every field you send today is still accepted, with the same retry and conflict answers. The submission contract is still *proposed*.

### New

- **Only two IDs to send.** `submitBookingRequests` needs only `external_event_id` and the organizer's `external_user_id`.
  - `external_booking_id` and each `external_request_id` are now optional. Gelatin derives missing ones (`gelatin:…`) and returns request IDs in `engagements[].external_request_id`.
  - Without a booking ID, the Idempotency-Key makes a retry the same booking, and a new key adds DJs to the same event.
- **Default submission key.** It is `booking:<external_booking_id>` when you send one, as before. Otherwise it is `submission:<sha-256 of the request>`: the same request gets the same key, and different content never shares one.
- **`PartnerApiError.djId`.** A submission's `409 dj_unavailable` now names the DJ as well as the request.
- **Cancelling a booking.**
  - `previewCancellation(bookingId)` says what cancelling would refund and what the DJ keeps, with the rule in words.
  - `cancelBooking(bookingId)` applies it. Its key defaults to `cancel:<bookingId>`.
  - A started event answers `409 not_cancellable`.
- The OpenAPI spec covers all of the above.

### Deprecated

- `external_submission_id`: accepted and ignored. Leave it out.

### Example

`examples/nextjs` sends only the event and organizer IDs and finds the unavailable DJ by `djId`.

## 0.1.0-alpha.6

Everything here is additive: no request field became required and no response field was removed or changed type. Code written for alpha.5 keeps working.

### New

- **Only the DJs free that night.** `listDjs({ date, available: true })` lists only DJs free on `date`. It needs `date`; without `available`, every DJ is listed with their own `available` as before.
- **Make a Deal and organizer standing (off by default).** Gelatin enables these per partner, by agreement. While it is off, a `make_a_deal` request is refused with `400 invalid_request`, `getOrganizerStanding` answers `404 not_found`, and nothing else changes.
  - `deal: "make_a_deal"` on a request (type `PartnerDeal`, default `confirm_and_book`): no card hold and no Gelatin charge, and the organizer pays the DJ directly. It needs the new `organizer.community_ref`.
  - `getOrganizerStanding(communityRef, { externalUserId })` returns `OrganizerStanding`: `may_add_talent`, `amount_owed` and each `OwedAmount`. It needs `bookings:read`. It is pull-only; there is no webhook.
  - While a community owes a DJ, a booking request for any of its events gets `403 organizer_owes`.
- The OpenAPI spec covers all of the above.

### Example

`examples/nextjs` lists only the DJs free on the picked night. When none are free but DJs match, it says so with **Change the date**. Its genre list follows the ticked budget bands. The example doesn't use Make a Deal.

## 0.1.0-alpha.5

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
