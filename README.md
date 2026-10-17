# MLBB Draft Coach

Enter the bans and picks from a Mobile Legends draft (10 bans, 5 enemy picks, 5 team picks) and get a recommended last pick or two. The analysis is done by DeepSeek on the server, using the current patch data in `data/context.json`. The API key never reaches the browser.

## Run locally

```bash
npm install
cp .env.example .env.local   # then put your real DeepSeek key in DEEPSEEK_API_KEY
npm run dev
```

Until the key is replaced, the app loads but the analysis returns "The DeepSeek API key is not set on the server."

## Deploy on Vercel

1. Import the repository as a new project (Next.js is detected automatically).
2. Under Project Settings > Environment Variables, add `DEEPSEEK_API_KEY` with the real key. Add `APP_PASSCODE` if you want the page limited to your team.
3. Deploy.

## Settings

All are environment variables, listed with defaults in `.env.example`: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` (default `deepseek-flash`), `APP_PASSCODE`, `RATE_LIMIT_PER_10MIN`.

The app uses one fast model with DeepSeek's "thinking" mode turned off, because draft decisions are made in seconds. An answer usually takes about 4 seconds.

## Pro meta data (MPL PH, Team Liquid PH weighted)

`data/meta.json` holds pro league stats that drive the suggestions. A GitHub Action (`.github/workflows/update-meta.yml`) rebuilds it daily at 00:30 Philippine time, and whenever the pipeline or its settings change:

1. `scripts/update-meta.mjs` reads the MPL Philippines Season 18 pages through the [Liquipedia](https://liquipedia.net/mobilelegends/) API (identifying User-Agent, gzip, one request per 2.5 seconds). Each game gives both teams' picks, bans, sides and the winner.
2. Liquipedia does not say who played which position, so `scripts/meta/build.mjs` infers it: every lineup must fill all five positions once, and each hero's likely positions are learned across all lineups, starting from its roles. Each lineup gets a confidence; corrections go in `data/position-overrides.json`.
3. Per hero and position it counts pro picks and wins, weighted by recency (28-day half-life) and with Team Liquid PH's games counted 3x, plus which heroes are picked together.

Settings (league pages, focus team, weight, half-life) are in `data/meta-config.json`. The inferred lineups are in `data/pro-games.json`. Data from Liquipedia is licensed CC BY-SA 3.0 and credited on the results page.

## How suggestions are made

For each open position the server builds a shortlist of up to 12 heroes that are available and played there by pros: your counter rules first, then Team Liquid PH's own picks in that position, heroes pros pair with your current picks, then the most-played heroes in that position. DeepSeek ranks 3 options per open position from that shortlist only, so a player can choose the one they play best. Each option shows its pro evidence. When pro data is missing, the shortlist falls back to the tier list.

## How an analysis works

1. `POST /api/analyze` checks the passcode and rate limit, then validates the draft: `bans` and `enemyPicks` are lists, `teamPicks` is an object keyed by position (`roam`, `marksman`, `jungler`, `mage`, `fighter`); every hero must be in the roster and appear once.
2. `lib/prompt.ts` builds the prompt from the patch notes, roster with tiers, pro draft signals and the draft itself.
3. `lib/deepseek.ts` calls DeepSeek in JSON mode.
4. `lib/draft.ts` checks every option against the roster, the draft and that position's shortlist, and expects 3 options per open position. If an option is invented, banned, already picked, off the shortlist, or a position has fewer than 3, the server asks once more with the problems listed, then drops anything still invalid.

## Fill the form from a link

The page fills its boxes from the link, so you only click **Analyze draft**:

```
https://mlbb-draft-coach-six.vercel.app/?bans=Hirara,Freya,Kaja&enemy=Tigreal,Gloo,Clint&marksman=Hanabi&jungler=Fanny&mage=Faramis&fighter=Yu%20Zhong
```

- `bans` (up to 10) and `enemy` (up to 5) are comma-separated hero names.
- Our picks go by position: `roam`, `marksman`, `jungler`, `mage`, `fighter`, one hero each. Leave a position out to mark it open.
- Case and spacing do not matter. Nothing is sent until you click the button.

To build and open that link for you (needs Node, nothing to install):

```bash
node scripts/open-draft.mjs tests/drafts/gloo-faramis-last-pick.json      # a saved draft
node scripts/open-draft.mjs --bans "Hirara,Freya" --enemy "Gloo,Clint" --marksman Hanabi --jungler Fanny --mage Faramis --fighter "Yu Zhong"
node scripts/open-draft.mjs --print tests/drafts/gloo-faramis-last-pick.json   # only print the link
```

## Positions

Our picks have five fixed positions: Roam, Marksman (gold lane), Jungler, Mage (mid lane) and Fighter (EXP lane). Empty positions are the ones the analysis fills: one hero per open position, or the two that matter most when three or more are open.

A hero fits a position when pros play it there (at least 3 games or 15% of its pro picks). Heroes with fewer than 3 pro picks fall back to their lanes in `data/context.json`, then to role (Roam: Tank or Support; Marksman: Marksman; Mage: Mage; Fighter: Fighter or Tank; Jungler: Assassin, Fighter or Tank). Hero roles come from mlbbhub.com.

## Your team's draft rules

`data/draft-rules.json` holds draft knowledge the model must respect. Edit it on GitHub and the site redeploys in about 30 seconds.

```json
{
  "counters": [
    { "enemy": "Gloo", "picks": ["Vexana", "Faramis"], "why": "" }
  ],
  "principles": [
    "Always secure a frontline before the last pick."
  ]
}
```

- **counters**: when the enemy picks `enemy`, the prompt tells the model to pick one of `picks` (skipping any that are banned or taken, and skipping the rule if your team already has one). If the model's picks ignore every applicable rule, the server asks once more. `why` is optional and is passed to the model as the reason.
- **principles**: plain sentences added to the instructions for every draft.

Hero names must match the roster (case and spacing do not matter). The results page shows which rules applied.

## Patch data

`data/context.json` is a snapshot (patch 2.2.16, Season 42, as of 2026-10-12). The page warns when it is more than 7 days old. `getContext()` in `lib/context.ts` is the single place to change when the data comes from a daily refresh job instead of this file.

## Tests

```bash
node scripts/mock-deepseek.mjs &                      # stand-in for the DeepSeek API
DEEPSEEK_API_KEY=test-key DEEPSEEK_BASE_URL=http://127.0.0.1:4010 RATE_LIMIT_PER_10MIN=60 npm start -- -p 3100 &
npm test                                              # runs scripts/smoke.mjs against it
```

## Known limits

- The rate limiter is in memory. On Vercel each server instance counts separately, so it slows abuse but is not a hard spending cap.
- The hero abilities of recently released heroes were not verified, and the prompt tells the model so.
