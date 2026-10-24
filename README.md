# ✈️ My Travel

Your flights, travel diary and membership cards in one place, with a live
briefing for every trip: gate, nearest lounge, visa rules for your passport,
strikes, and how to get into town.

**▶ Live page: https://claude.ai/artifact/8AeL6cpTZhtQFZ2GtsVRj1**
Opens on claude.ai (sign in first). It is private until the owner shares it
from the page's Share menu. This is the claude.ai version described under
*Publish as a claude.ai page* below; the full app with live gates and calendar
sync runs on your own deployment (see *Deploy on Render*).

**Trips:** your next flight as a boarding pass with a destination photo,
countdown, weather and live gate/delay updates.
**Add:** bring flights in from TripIt, calendars, Wallet passes, e-tickets,
booking emails or a whole logbook. You don't type anything by hand.
**Diary:** every flight you've taken, on a world map, with lifetime stats.
**Wallet:** all your frequent-flyer, hotel, car-rental and lounge cards with
scannable barcodes. Each flight shows which number to give at check-in.
**Briefing:** lounges ranked by distance from your gate, entry requirements,
strikes and disruptions, and train/taxi/Uber options into the city.

Everything you add is stored privately on your phone (IndexedDB). Use
*Profile → Download backup* to keep a copy or move it to a new phone.

## Getting flight data in without typing

We looked at every app and service a traveller might already use. These are
the ones that can actually hand over flight data, and how My Travel connects
to each one:

| Source | How it connects | Notes |
|---|---|---|
| **TripIt** | Private calendar feed (Settings → Calendar Feeds) | Re-sync any time from Profile. TripIt's official API needs a developer agreement with OAuth 1.0, so the feed is the practical route. |
| **Google Calendar** (flights Gmail detects) | "Secret address in iCal format" | Gmail adds flights from airline emails automatically, so this covers most bookings with no extra app. |
| **Outlook / Microsoft 365** | Published calendar ICS link | Same idea for Outlook users. |
| **Kayak Trips, TripCase, Flighty calendar sync** | Their iCal / calendar-sync link | Any `.ics` or `webcal://` feed works. |
| **Google Wallet** | Screenshot of the pass → upload | Google's Wallet API only lets *issuers* create passes. No app can read your Wallet, so a screenshot is the route: the barcode is decoded on the phone, or by AI if it can't be scanned. |
| **Apple Wallet** | Share the pass → `.pkpass` file → upload | Read entirely on the device. |
| **Airline apps / any boarding pass** | Camera scan or screenshot | Uses the IATA BCBP barcode that every boarding pass carries. |
| **E-tickets & itineraries (PDF)** | Upload | AI reads every segment, including returns and connections. |
| **Booking emails** (airlines, Booking.com, Expedia, eDreams, Kiwi.com…) | Paste the text | Any language. |
| **Flighty** | CSV export → upload | ICAO airline codes are mapped automatically. |
| **myFlightradar24** | Settings → Export → CSV → upload | |
| **OpenFlights, JetLovers, spreadsheets** | CSV upload | Needs date, from and to columns; flight, airline, seat, class and times are picked up when present. |
| **Flight number + date** | Type it | Route, times and aircraft are filled in from live schedules (AeroDataBox). |

Not possible today: reading Google Wallet directly (no API for this), App in
the Air (shut down in September 2024), and AwardWallet's loyalty APIs
(available only to business partners).

## Run it

Requires Node.js 22+.

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY (and AERODATABOX_API_KEY)
npm run build            # build the web app
npm start                # http://localhost:3000
```

| Key | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | Travel briefings, and reading e-tickets, screenshots and emails |
| `AERODATABOX_API_KEY` (optional) | Live gates, delays, belt, and auto-filling flights from a number |
| `APP_PASSWORD` (recommended when public) | Asks for a password before anyone can use your deployment |

### Deploy on Render

The repo includes `render.yaml`. In Render, choose **New → Blueprint**, pick
this repo and the `main` branch, and enter the keys above. Open the URL on
your phone and use **Add to Home screen**. Camera scanning and notifications
need HTTPS, which Render provides.

### Publish as a claude.ai page

`npm run build:artifact` packs the whole app into `dist-artifact/my-travel.html`,
a single page that can be published on claude.ai. There, briefings and
ticket reading use the viewer's own Claude account, and flights and cards are
saved privately to their claude.ai account. Live gates and delays, calendar
feeds, PDF tickets, airline logos, photos and weather need the full app.

## Development

```bash
npm run dev       # API server with auto-restart (port 3000)
npm run dev:web   # web app with hot reload (port 5173, proxies /api)
npm run typecheck
npm test          # importers, calendar parsing, boarding passes, diary maths, loyalty matching
npm run build:data  # refresh the airport/airline datasets
```

```
server/                 Node + Express API
  calendar.js           iCalendar feeds → flights (TripIt, Google, Outlook…)
  bcbp.js               IATA boarding-pass barcode parser (shared with the web app)
  claude.js             AI: travel briefing (web search) and document reading
  flightStatus.js       AeroDataBox live status and schedules
web/                    React + TypeScript + Vite installable web app
  src/pages/            Trips, Add, Diary, Flight, Wallet, Profile
  src/lib/importers/    CSV logbooks, Apple Wallet passes
  src/lib/loyalty.ts    55+ loyalty programmes with alliances and tiers
  src/lib/airlines.ts   airline names, alliances, brand colours, logos
  public/data/          airports (time zones, coordinates) and airlines
scripts/build-data.mjs  regenerates public/data from open datasets
```

Data and credits: airports from [OurAirports](https://ourairports.com/data/)
(public domain) with time zones from [mwgg/Airports](https://github.com/mwgg/Airports)
(MIT); airlines from [OpenFlights](https://openflights.org/data) (ODbL);
airline logos from public logo CDNs; destination photos from Wikipedia;
weather from [Open-Meteo](https://open-meteo.com).

Gates can change at the last minute, so always confirm on the airport screens.
