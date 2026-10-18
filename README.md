# ✈️ My Travel

A personal travel companion for your phone. Pick a flight from **TripIt**, by
**airline + flight number + date**, or from your **boarding pass** (Google
Wallet screenshot or barcode scan). You then get one screen with:

- **Local time** at the departure and arrival airports (live clocks)
- **Terminal, gate, status and delays**, refreshed every 5 minutes, with
  phone notifications when the gate, terminal, delay or status changes
- **The nearest lounge you can use** for your airline/alliance, ranked by
  walking distance from your gate, with hours and access rules
- **Entry requirements for your passport** (Greek by default): visa,
  ETA/ETIAS/ESTA, passport validity
- **Strikes and disruptions** (airport, airline, air traffic control, local
  transport) around your travel date
- **Getting into the city** after landing: train/metro, bus, taxi rank and
  Uber/Bolt pickup point, with journey time and price
- Tips, plus the sources used

The last briefing is kept on the phone, so it still opens at the airport with
poor signal.

## Where the data comes from

| Need | Source |
|---|---|
| Your trips | TripIt private calendar feed (TripIt → Settings → Calendar Feeds → *Subscribe*). Paste the link once; it stays on your device. |
| Boarding pass | The barcode on every pass (IATA BCBP standard) is read on the phone. If the barcode can't be scanned, Claude reads the screenshot. |
| Terminal, gate, delays | [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) live flight data (optional; without it Claude looks these up). |
| Lounges, visa, strikes, transport | Claude with live web search and page reading, checked against airport, airline, government and news sources. |

> **About Google Wallet:** Google doesn't let other apps read passes stored in
> Wallet. Open the pass in Wallet, take a screenshot and upload it in the
> *Boarding pass* tab. This works for every airline.

## Run it

Requires Node.js 22+.

```bash
npm install
cp .env.example .env     # add your ANTHROPIC_API_KEY (and AERODATABOX_API_KEY)
npm start                # http://localhost:3000
```

To use it on your phone, deploy it over HTTPS. The repo includes a
`render.yaml` for one-click deployment on [Render](https://render.com)
(New → Blueprint → pick this repo). Set `APP_PASSWORD` so only you can use it. Open it in Chrome or Safari and choose
**Add to Home screen**. Camera scanning and notifications need HTTPS.
The live barcode scanner works in Chrome on Android; on iPhone, upload a screenshot instead.

Set your passport, usual cabin and frequent-flyer status under ⚙️ so lounge
access and entry rules match you.

## Development

```bash
npm run dev   # auto-restart on changes
npm test      # parser tests (TripIt feed, boarding-pass barcode)
```

```
server/
  index.js         API routes + static hosting
  tripit.js        TripIt iCal feed → trips and flights
  bcbp.js          IATA boarding-pass barcode parser
  flightStatus.js  AeroDataBox live status (terminal, gate, delay)
  claude.js        Claude: briefing research + boarding-pass image reading
public/            Installable phone web app (no build step)
test/              node:test unit tests
```

Gates can change at the last minute, so always confirm on the airport screens.
