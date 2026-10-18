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
const GAMES_MAX_DAYS = 14; // the MPL leagues play every weekend outside breaks

const alerts = [];

const patchAge = daysSince(context.meta.dataAsOf);
if (patchAge > PATCH_MAX_DAYS) {
  alerts.push(
    `Patch data is ${patchAge} days old (data/context.json, patch ${context.meta.patch}, as of ${context.meta.dataAsOf}). ` +
      `The site is warning players that recent balance changes may be missing. Update the patch notes, tiers and any new heroes.`
  );
}

// Each league on its own, so one league ending its season is noticed even while the others play.
for (const league of config.leagues) {
  const built = meta.leagues?.find((l) => l.id === league.id);
  if (!built?.games) {
    alerts.push(`${league.name} has no games in the pro data. Check its pages in data/meta-config.json: ${league.pages.join(", ")}.`);
    continue;
  }
  const gameAge = daysSince(built.latestGame);
  if (gameAge > GAMES_MAX_DAYS) {
    alerts.push(
      `No new ${league.short} games for ${gameAge} days (latest ${built.latestGame} in ${league.name}). ` +
        `The season may have ended or moved to new Liquipedia pages. Update its pages in data/meta-config.json.`
    );
  }
}

const noLogo = (meta.teams ?? []).filter((t) => !t.logo);
if (noLogo.length) {
  alerts.push(
    `No logo found for: ${noLogo.map((t) => `${t.name} (${t.id})`).join(", ")}. The site shows their initials instead. ` +
      `Add each team's Liquipedia page to "teamPages" in data/meta-config.json, e.g. "${noLogo[0].id}": "Exact Page Title".`
  );
}

if (meta.unknownHeroes?.length) {
  alerts.push(
    `Liquipedia lists heroes the app doesn't know: ${meta.unknownHeroes.join(", ")}. ` +
      `Add them to data/context.json (new heroes) or to HERO_ALIASES in scripts/meta/parse.mjs (spelling differences).`
  );
}

// A page for a league's next season means it has moved on. One request covers every league.
const nextSeason = config.leagues
  .map((league) => {
    const season = Number(league.name.match(/Season\s+(\d+)/i)?.[1]);
    const base = league.pages[0]?.replace(/Season_\d+.*$/, "");
    return season && base ? { league, season: season + 1, title: `${base}Season_${season + 1}` } : null;
  })
  .filter(Boolean);
if (!offline && nextSeason.length) {
  try {
    const titles = nextSeason.map((n) => n.title);
    const url = `https://liquipedia.net/mobilelegends/api.php?action=query&prop=info&format=json&formatversion=2&titles=${titles.map(encodeURIComponent).join("|")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MLBBDraftCoach/1.0 (https://github.com/KZY020821/mlbb-draft-coach)", "Accept-Encoding": "gzip" }
    });
    if (res.ok) {
      const q = (await res.json())?.query ?? {};
      const found = new Set((q.pages ?? []).filter((p) => !p.missing && !p.invalid).map((p) => p.title));
      for (const n of nextSeason) {
        const title = q.normalized?.find((x) => x.from === n.title)?.to ?? n.title;
        if (found.has(title)) {
          alerts.push(
            `Liquipedia now has a page for ${n.league.short} Season ${n.season} (${n.title}). When its matches start, change that league's "name" and "pages" in data/meta-config.json to the new season.`
          );
        }
      }
    }
  } catch (e) {
    console.log(`Could not check for new season pages: ${e.message}`);
  }
}

writeFileSync("alerts.txt", alerts.join("\n\n"));
console.log(alerts.length ? `${alerts.length} alert(s):\n\n${alerts.join("\n\n")}` : "All checks passed.");
