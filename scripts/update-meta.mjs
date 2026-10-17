#!/usr/bin/env node
// Builds data/meta.json and data/pro-games.json from pro league drafts on Liquipedia.
// Runs daily in GitHub Actions (.github/workflows/update-meta.yml), or by hand:
//   node scripts/update-meta.mjs                    fetch from the Liquipedia API
//   node scripts/update-meta.mjs --from-dir <dir>   use saved wikitext files instead (tests)
//
// Liquipedia API rules followed here: an identifying User-Agent, gzip, at most one request
// every 2 seconds, and action=query (not action=parse). Data is CC BY-SA 3.0, credited in the output.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMatches } from "./meta/parse.mjs";
import { buildMeta } from "./meta/build.mjs";

const root = new URL("..", import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(root, "data/meta-config.json"), "utf8"));
const roster = JSON.parse(readFileSync(join(root, "data/context.json"), "utf8")).heroes;
const USER_AGENT = "MLBBDraftCoach/1.0 (https://github.com/KZY020821/mlbb-draft-coach)";
const API = "https://liquipedia.net/mobilelegends/api.php";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In GitHub Actions, "::error::" lines become annotations that are readable without the full log.
const inActions = Boolean(process.env.GITHUB_ACTIONS);
function report(message) {
  console.error(inActions ? `::error::${message.replace(/\r?\n/g, " ")}` : message);
}
process.on("uncaughtException", (e) => {
  report(`update-meta failed: ${e?.stack || e}`);
  process.exit(1);
});

async function fetchWikitext(title) {
  const url = `${API}?action=query&prop=revisions&rvprop=content|timestamp&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" } });
  const body = await res.text();
  if (!res.ok) throw new Error(`Liquipedia returned HTTP ${res.status} for ${title}: ${body.slice(0, 200)}`);
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`Liquipedia sent a non-JSON reply for ${title}: ${body.slice(0, 200)}`);
  }
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) return null;
  return page.revisions?.[0]?.slots?.main?.content ?? null;
}

const args = process.argv.slice(2);
const fromDir = args.includes("--from-dir") ? args[args.indexOf("--from-dir") + 1] : "";

const games = [];
const pagesUsed = [];
for (const [i, title] of config.pages.entries()) {
  let text = null;
  if (fromDir) {
    const file = join(fromDir, title.replace(/[\\/]/g, "__") + ".wiki");
    text = existsSync(file) ? readFileSync(file, "utf8") : null;
  } else {
    if (i > 0) await sleep(2500);
    text = await fetchWikitext(title);
  }
  if (!text) {
    console.log(`skip: ${title} (no page yet)`);
    continue;
  }
  const parsed = parseMatches(text, title);
  console.log(`${title}: ${parsed.length} played games`);
  games.push(...parsed);
  pagesUsed.push(`https://liquipedia.net/mobilelegends/${title.replace(/ /g, "_")}`);
}

if (!games.length) {
  report("No games found; leaving the data files unchanged.");
  process.exit(fromDir ? 1 : 0);
}

const overridesPath = join(root, "data/position-overrides.json");
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")).lineups ?? [] : [];

const { meta, lineups } = buildMeta(games, roster, {
  overrides,
  league: config.league,
  focusTeam: config.focusTeam,
  focusWeight: config.focusWeight,
  halfLifeDays: config.halfLifeDays,
  pages: pagesUsed,
  fetchedAt: new Date().toISOString()
});

const credit = {
  source: "Liquipedia",
  license: "CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)",
  pages: pagesUsed,
  note: "Positions are inferred from picks, not taken from Liquipedia."
};

// Only rewrite the files when the data changed, so the daily job makes no empty commits.
const strip = (o) => JSON.stringify({ ...o, source: { ...o.source, fetchedAt: "" } });
const metaPath = join(root, "data/meta.json");
const old = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : null;
if (old && strip(old) === strip(meta)) {
  console.log("No changes in the pro data.");
} else {
  writeFileSync(metaPath, JSON.stringify(meta, null, 1) + "\n");
  writeFileSync(join(root, "data/pro-games.json"), JSON.stringify({ ...credit, lineups }, null, 1) + "\n");
  console.log(`Wrote data/meta.json: ${meta.games} games (${meta.focusGames} with ${meta.focusTeam}), latest ${meta.latestGame}.`);
}
if (meta.unknownHeroes.length) console.log("Unknown hero ids (add to HERO_ALIASES):", meta.unknownHeroes.join(", "));
console.log("Average position confidence:", meta.positionConfidence);
