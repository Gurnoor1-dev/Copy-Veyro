# VEYRO IFATC Prep

The IFATC Prep tab is available from the airport details modal.

## Airport briefing data

The tab shows available ATIS/D-ATIS, METAR, airport elevation, and runway reference information. Configure `ATIS_RELAY_API_KEY` as a server-side environment variable. Do not prefix it with `VITE_`, expose it in frontend code, or commit it.

The backend requests:
- `GET /api/atis_relay_airport?icao=...` — available ATIS/transcript, METAR, and D-ATIS.
- `GET /api/runways?icao=...` — runway reference data.

The backend does not initiate phone-line captures. Missing provider fields are shown as unavailable rather than fabricated. The API key is never returned to the browser.

## IFATC altitude formulas

When airport elevation is available from VEYRO airport reference data:

1. **Pattern altitude:** add 1,500 ft to airport elevation, then round UP to the nearest 100 ft.
   - `pattern = ceil((airport elevation + 1500) / 100) × 100`
2. **Transition altitude:** add 1,000 ft to the calculated pattern altitude, then round UP to the nearest 500 ft.
   - `transition = ceil((pattern altitude + 1000) / 500) × 500`

Both values are displayed in feet MSL. If airport elevation is missing, no altitude values are invented.

## Validation checklist

- Configure `ATIS_RELAY_API_KEY` in the server/Vercel environment.
- Check an airport with current ATIS and one with no current transcript.
- Confirm runway data gracefully displays an unavailable state if none is returned.
- Verify pattern altitude rounds upward in 100 ft increments.
- Verify transition altitude uses the rounded pattern altitude and rounds upward in 500 ft increments.
- Confirm the panel does not show airport frequencies, airport remarks, the ATIS Relay attribution link, or the warning banner.
