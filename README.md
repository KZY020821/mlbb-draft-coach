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

All are environment variables, listed with defaults in `.env.example`: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` (default `deepseek-flash`), `DEEPSEEK_DEEP_MODEL` (default `deepseek-v4-pro`, shows the "Deeper analysis" box), `APP_PASSCODE`, `RATE_LIMIT_PER_10MIN`.

## How an analysis works

1. `POST /api/analyze` checks the passcode and rate limit, then validates the draft (known heroes, no duplicates, team not full).
2. `lib/prompt.ts` builds the prompt from the patch notes, roster with tiers, pro draft signals and the draft itself.
3. `lib/deepseek.ts` calls DeepSeek in JSON mode.
4. `lib/draft.ts` checks every suggested hero against the roster and the draft. If a pick is invented, banned or already picked, the server asks once more with the problems listed, then drops anything still invalid.

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
