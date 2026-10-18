// Checks for things the weekly job can't fix by itself and writes them to alerts.txt
// (one per paragraph). The workflow emails that file to the owner when it isn't empty.
//   node scripts/check-health.mjs            check, including whether a new season page exists
//   node scripts/check-health.mjs --offline  skip the Liquipedia request (tests)
import { readFileSync, writeFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const context = read("context.json");
const meta = read("meta.json");
const config = read("meta-config.json");
const offline = process.argv.includes("--offline");
const now = process.env.HEALTH_NOW ? Date.parse(process.env.HEALTH_NOW) : Date.now(); // HEALTH_NOW lets tests pretend it is a later date
const daysSince = (iso) => Math.floor((now - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);

const PATCH_MAX_DAYS = 7; // same point at which the site starts warning players
const GAMES_MAX_DAYS = 14; // MPL PH plays every weekend outside breaks

const alerts = [];

const patchAge = daysSince(context.meta.dataAsOf);
if (patchAge > PATCH_MAX_DAYS) {
  alerts.push(
    `Patch data is ${patchAge} days old (data/context.json, patch ${context.meta.patch}, as of ${context.meta.dataAsOf}). ` +
      `The site is warning players that recent balance changes may be missing. Update the patch notes, tiers and any new heroes.`
  );
}

if (!meta.games) {
  alerts.push(`The pro data has no games. Check the league pages in data/meta-config.json: ${config.pages.join(", ")}.`);
} else {
  const gameAge = daysSince(meta.latestGame);
  if (gameAge > GAMES_MAX_DAYS) {
    alerts.push(
      `No new pro games for ${gameAge} days (latest ${meta.latestGame} in ${config.league}). ` +
        `The season may have ended or moved to new Liquipedia pages. Update the pages in data/meta-config.json.`
    );
  }
}

if (meta.unknownHeroes?.length) {
  alerts.push(
    `Liquipedia lists heroes the app doesn't know: ${meta.unknownHeroes.join(", ")}. ` +
      `Add them to data/context.json (new heroes) or to HERO_ALIASES in scripts/meta/parse.mjs (spelling differences).`
  );
}

// A page for the next season means the league has moved on.
const season = Number(config.league.match(/Season\s+(\d+)/i)?.[1]);
if (!offline && season) {
  const base = config.pages[0]?.replace(/Season_\d+.*$/, "") ?? "MPL/Philippines/";
  const next = `${base}Season_${season + 1}`;
  try {
    const url = `https://liquipedia.net/mobilelegends/api.php?action=query&prop=info&format=json&formatversion=2&titles=${encodeURIComponent(next)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MLBBDraftCoach/1.0 (https://github.com/KZY020821/mlbb-draft-coach)", "Accept-Encoding": "gzip" }
    });
    if (res.ok) {
      const page = (await res.json())?.query?.pages?.[0];
      if (page && !page.missing) {
        alerts.push(
          `Liquipedia now has a page for Season ${season + 1} (${next}). When its matches start, change "league" and "pages" in data/meta-config.json to the new season.`
        );
      }
    }
  } catch (e) {
    console.log(`Could not check for a new season page: ${e.message}`);
  }
}

writeFileSync("alerts.txt", alerts.join("\n\n"));
console.log(alerts.length ? `${alerts.length} alert(s):\n\n${alerts.join("\n\n")}` : "All checks passed.");
