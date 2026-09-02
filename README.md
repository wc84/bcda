# BCDA All Stars

Scoreboard and admin portal for the Broward County Darts Association, published at
**smartdart.net/bcda/scoreboard** and **smartdart.net/bcda/admin**.

Admins drop the two DartConnect leaderboard exports for a league, check the preview,
and publish. No spreadsheet, no redeploy.

```
public/scoreboard.html   public board — record tiles, league/division tabs, sortable table
public/admin.html        passcode-gated upload, preview, publish, rollback
public/assets/engine.mjs the scoring engine — imported by BOTH the browser and the server
netlify/functions/       stats (public read), login, publish, admin (versions/rollback/roster)
test/engine.test.mjs     fixtures from the 2026 Doubles A sheet + the real Singles exports
```

## The All Stars math

**Cricket** — counts used exactly as the export gives them. 5-mark turns score nothing.

| 6M | 7M | 8M | 9M | 3B | 4B | 5B | 6B |
|----|----|----|----|----|----|----|----|
| 1  | 2  | 3  | 4  | 1  | 2  | 3  | 4  |

**'01** — 100–139 = 1, 140–179 = 2, 180 = 4.

The rule is written in ranges, but DartConnect ships `100+` and `140+` as **cumulative**
totals: `100+` counts every ton and `140+` includes the 180s. Scoring the raw columns
would count a 180 three times.

The engine resolves the three ranges two ways, preferring the first:

1. **From the per-band columns** (`T00_19`, `T20_39`, `T40_59`, `T60_79`) when the export
   carries them, which it does today. Exact, and correct whether or not a given export
   happens to be cumulative.
2. **By subtraction** when it does not: `100–139 = (100+) − (140+)`, `140–179 = (140+) − 180`.

The board labels these columns `100-139` / `140-179` / `180` rather than `100+` / `140+`,
so a row visibly adds up to its own All Stars total.

## Running it locally

```bash
npm install
npm test
netlify dev --offline
```

`netlify dev` reads `.env` (git-ignored). Two variables are required:

| Variable | What it is |
|---|---|
| `BCDA_ADMIN_PASSCODE` | The shared admin passcode. |
| `BCDA_SESSION_SECRET` | Long random string used to sign the 8-hour session token. |

Set both in Netlify under **Project configuration → Environment variables**. Neither ever
reaches the browser: the passcode is compared server-side in constant time, and the browser
only ever holds a signed token in `sessionStorage`.

## How it is served

The site deploys to its own Netlify project behind `bcda.smartdart.net`, and smartdart.net
proxies the path. In **smartdart's** `_redirects`:

```
/bcda      /bcda/                              301!
/bcda/*    https://bcda.smartdart.net/:splat   200
```

Two consequences worth remembering when editing this repo:

- **Every path in the HTML is relative** (`assets/theme.css`, `api/stats`). An absolute
  `/assets/...` would resolve against smartdart.net and 404.
- **`netlify.toml` uses `status = 200` rewrites, never redirects.** A 3xx from this origin
  sends a `Location` the visitor's browser resolves against smartdart.net.

## Storage

Netlify Blobs, store `bcda`. Nothing here lives in git, so a weekly update never triggers a
build.

| Key | Contents |
|---|---|
| `index` | Every published season+league, newest first. |
| `board/{season}/{league}` | The board currently live. |
| `version/{season}/{league}/{id}` | Every published version, for rollback. |
| `raw/{season}/{league}/{id}/*.csv` | The original uploads, kept so any week can be reprocessed. |
| `roster` | Gender and team overrides for what the export omits. |

## Weekly update

1. Export the cricket and '01 leaderboards from DartConnect.
2. Open **smartdart.net/bcda/admin** and sign in.
3. Set the season and pick the league.
4. Drop both CSVs in — either order, each is identified by its own columns.
5. **Process**, then read the preview: player count, what changed against what is live, and
   any warnings.
6. **Publish**. The public board updates within seconds.

Nothing is written until Publish. If a week goes out wrong, **Restore** any earlier version
from Published history.

## What the parser will tell you about

These all occur in the real exports, and none of them is guessed at silently:

- A player in one file but not the other — warned, never scored as a silent zero.
- A blank `Gender` — flagged, and set from the roster rather than assumed.
- A blank `HDI` or `HDO` — excluded from the record tiles instead of sorting as 0.
- `B Divison` — the typo in the live export is normalised to division B.
- A file dropped into the wrong slot — rejected by header signature, both in the browser
  and again on the server.
