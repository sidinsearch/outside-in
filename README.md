# SuperBrain Spotify Connector

An "outside-in" TypeScript adapter that extracts a user's recent listening history from Spotify without relying on enterprise backend API tiers.

This module implements the exact `ConnectorAdapter` interface required by SuperBrain.

## How it works

1. It takes an authorized Spotify session token (provided by the SuperBrain frontend/client).
2. It hits the Spotify API directly using an injected `fetchImpl`.
3. It maps the payload to the exact `CandidateItem` schema enforcing:
   - Valid, credential-free URLs.
   - Clean handling of empty responses (`empty_verified`).
   - Honest `CoverageReport`s to prevent false-positives when paginating or handling errors.

## Testing

Tests are written using `vitest` and execute entirely offline by mocking `fetchImpl`, exactly as requested.

```bash
npm install
npm run test
```

## Caveats & Notes on Approach

**TOS & Rate Limits:** Because this is an outside-in implementation utilizing a client-side token mapped to a regular Spotify Web API application, you are subject to the standard Web API quota limits (429 errors). If this scales massively, Spotify may detect unusual traffic patterns from a single developer Client ID unless the token generation is highly decentralized or properly distributed.

**Pagination:** The Spotify API uses `cursors.after`. This adapter returns `partial` in the CoverageReport when `next` is present.

**Podcast Limitation:** Spotify's `recently-played` API explicitly returns tracks, not podcasts, at this time. If podcast extraction is strictly necessary, it will require either polling the Web Player's internal undocumented GraphQL endpoints (brittle and risky) or relying on the user's explicit GDPR data export.