# Next.js partner example

A complete, runnable partner website that books Gelatin DJs with this SDK. It does what your platform will do: show Gelatin's DJs, send the organizer's booking request, take the card hold on its own page in Stripe's checkout form, hand the organizer to Gelatin's booking page when a DJ counters, and show each booking's live status.

**In plain words:** this is a small pretend events website. Run it on your laptop against Gelatin's sandbox, click through the whole booking journey with test cards, and read the code to see exactly which calls your own site needs to make, and where. Nothing here touches real money.

## What you need from Gelatin

Gelatin sets these up for you in the sandbox:

| What | Example | Used as |
| --- | --- | --- |
| Partner slug | `your-partner` | `GELATIN_PARTNER_SLUG` |
| Sandbox API key, starting `gel_test_`, with scopes `catalog:read`, `requests:write`, `launch:write` and `bookings:read` | sent to you privately | `GELATIN_PARTNER_KEY` |
| Your booking page origin, where organizers review and pay | `https://your-partner.staging.gelatinbookings.com` | `GELATIN_PORTAL_ORIGINS` |
| A registered return origin for this example | `http://127.0.0.1:3100` | `DEMO_PUBLIC_ORIGIN` |

Gelatin only sends organizers back to origins registered for your partner, so ask for `http://127.0.0.1:3100` to be added before you run this locally. The sandbox accepts local `http` origins; live accepts only `https`.

## Run it

Requires Node.js 20.9 or later.

```sh
git clone https://github.com/gelatinbookings/gelatin-partner-sdk.git
cd gelatin-partner-sdk/examples/nextjs
npm install
cp .env.example .env.local   # then fill in the values above
npm run dev                  # http://127.0.0.1:3100
```

Open `http://127.0.0.1:3100` (not `localhost`: the address must match `DEMO_PUBLIC_ORIGIN` exactly) and sign in with the `DEMO_ACCESS_PASSWORD` you chose. If a variable is missing or malformed, every page returns `503` and the terminal names the variable.

`npm test`, `npm run typecheck` and `npm run build` check the app.

## Walk through the journey

1. **Find DJs** (`/`). The list comes from your partner catalog. Filter by city, or pick a date to see who is available that night.
2. **Your event.** Add one to five DJs, fill in the event and an organizer email you can read, set a fee per DJ and send. Gelatin replies with each DJ's organizer total, fees included.
3. **Bookings** (`/bookings`). One row per DJ. Choose **Pay now**: Stripe's checkout opens under the row, on this site's own page. Use Stripe's test card `4242 4242 4242 4242`, any future expiry and any CVC (`4000 0027 6000 3184` shows the bank's extra security check). No money moves yet.
4. **Card held.** Within a few seconds the row reads *Card held · waiting for the DJ*: Stripe has confirmed the hold to Gelatin and the DJ has the request.
5. **A new offer** from a DJ shows *Review the new offer in Gelatin*. That opens your Gelatin booking page with a one-use link, where the organizer accepts, declines or pays the new amount, then *Back to your event* returns to this site's `/return` page.
6. **The DJ answers** in their Gelatin inbox. In the sandbox someone on the Gelatin team plays the DJ, so tell them when you've placed a hold. Ask them to try each outcome:
   - **Accept:** Gelatin takes the payment and emails the organizer. The row shows *Confirmed*.
   - **Counter:** the DJ proposes a different fee. The row shows *New offer from the DJ*; open it in Gelatin to accept the new amount with a fresh card hold, or keep negotiating.
   - **Decline:** the hold is released and the row shows *Declined by the DJ*.

Reload `/bookings` at any point to see the current status. The statuses the example shows:

| Status | Shown as | What the organizer does |
| --- | --- | --- |
| `authorization_required` | Payment needed | Pay now, on this page |
| `reauthorization_required` | New offer from the DJ | Open Gelatin and review the counteroffer |
| `requested` | Card held · waiting for the DJ | Nothing; the DJ is deciding, or has accepted and the payment is going through |
| `negotiating` | Negotiating | Nothing; the DJ is answering the organizer's counteroffer |
| `confirmed` | Confirmed | Nothing; the DJ is booked and paid |
| `declined`, `expired`, `cancelled` | as named | Book another DJ |

## Where the integration lives

Everything that talks to Gelatin runs on the server. The browser never sees the API key.

| File | What it shows |
| --- | --- |
| [`lib/gelatin.ts`](lib/gelatin.ts) | Creating the SDK client, checking that a launch URL is really your Gelatin booking page, and turning `PartnerApiError` codes into messages |
| [`app/page.tsx`](app/page.tsx) | `listDjs`: the catalog, with city and date filters and paging |
| [`lib/submission.ts`](lib/submission.ts) | Building the booking request: your IDs, the organizer, the event times with an explicit time zone, and one entry per DJ |
| [`lib/handlers.ts`](lib/handlers.ts) | `submitBookingRequests`, `createPaymentSession` and `createPortalLaunch`, called from this app's own API routes |
| [`app/pay-button.tsx`](app/pay-button.tsx) | Mounting Stripe's checkout in the page with the client secret, and falling back to Gelatin on `portal_required` |
| [`lib/status.ts`](lib/status.ts) | `getEventBookings`: reading each DJ's status by your event ID |
| [`app/return/page.tsx`](app/return/page.tsx) | The return page Gelatin sends the organizer back to |

Rules the code follows that your site should too:

- **Keep the key on the server.** Read it from the environment, call Gelatin only from server code, and never send it to the browser.
- **Use your own stable IDs.** `external_booking_id`, `external_event_id` and each `external_request_id` should be IDs from your database. Gelatin accepts each booking ID once, so a double click or a retry is the same booking, not a second one.
- **Keep one organizer ID per person.** Gelatin remembers the email it first saw for an `external_user_id`, so use your user's stable ID, and launch with the same organizer ID the booking was submitted with.
- **Create the launch when the organizer clicks, then redirect at once.** A launch link works once and expires after about 60 seconds, so don't put one in an email or keep it for later.
- **Only redirect to your booking page.** Check that the launch URL is on your Gelatin booking page origin before sending the browser there, as `approvedLaunchUrl` does.
- **Hand the client secret to that organizer only.** It opens only their checkout, but treat it like a one-time link: don't log it or store it.
- **Trust status, not the browser.** When Stripe's form finishes, show "confirming" and read status; the hold counts once Gelatin reports `requested`.
- **Read status when you show it.** Gelatin does not call your server. Read status when the organizer returns, when they open the event, or on a schedule.

## What is example scaffolding

These parts exist only so the example runs on its own. Use your platform's own versions instead:

- **The password page** stands in for your own sign-in.
- **The bookings list lives in a signed cookie** in one browser, because the example has no database. Store the IDs from `submitBookingRequests` (your event ID, each `request_id` and the organizer ID) with your own event.
- **IDs come from a random value per form.** Yours should come from your database.
- **The fee form takes whole dollars**, and DJs per booking are capped at five so the cookie stays small.

## Going live

Live is a separate environment with its own partner setup and keys:

- `GELATIN_API_BASE_URL=https://www.gelatinbookings.com`. Use `www`: the bare domain redirects, and the SDK does not follow redirects.
- A `gel_live_` key, issued by Gelatin for live. Sandbox keys don't work on live, or the other way round.
- Your own booking page domain, for example `booking.your-site.com`. You add one DNS record that Gelatin gives you.
- Your production return origins, registered with Gelatin. Live accepts only `https`.

This example refuses `gel_live_` keys on purpose. It is for the sandbox only.

## When something goes wrong

Every failure shows a short message and, where Gelatin returned one, a request ID. Quote that ID to Gelatin support.

| You see | Usually means |
| --- | --- |
| `503` on every page | A variable in `.env.local` is missing or malformed; the terminal names it |
| "did not accept this demo's API key" | Wrong key, revoked key, or a live key on the sandbox |
| "missing a required scope" | The key needs `catalog:read`, `requests:write`, `launch:write` and `bookings:read` |
| "Gelatin rejected the request" on send | Often a return URL outside your registered origins: check `DEMO_PUBLIC_ORIGIN` matches what Gelatin registered |
| "isn't available for this event" | That DJ is booked that night or not yet able to take payments. Nothing was saved; pick another DJ or date |
| "Gelatin returned an unexpected address" | `GELATIN_PORTAL_ORIGINS` doesn't include your booking page origin |
| "No DJs match" | Gelatin has not shared the catalog with your partner yet |

The full API, including every field and error, is in the [SDK README](../../README.md) and the [OpenAPI spec](../../openapi/partner-api.openapi.json).
