#!/usr/bin/env node
// Builds data/meta.json and data/pro-games.json from MPL ID, PH and MY drafts on Liquipedia,
// and keeps each team's logo in public/teams. Runs every Tuesday in GitHub Actions
// (.github/workflows/update-meta.yml), or by hand:
//   node scripts/update-meta.mjs                    fetch from the Liquipedia API
//   node scripts/update-meta.mjs --from-dir <dir>   use saved wikitext files instead, no logos (tests)
//   node scripts/update-meta.mjs --refresh-logos    check every team's logo, not only missing ones
//
// Liquipedia API rules followed here: an identifying User-Agent, gzip, at most one request
// every 2 seconds, several pages per request, and action=query (not action=parse).
// Data is CC BY-SA 3.0, credited in the output.

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { parseMatches } from "./meta/parse.mjs";
import { buildMeta } from "./meta/build.mjs";
import { infoboxLogo, pagesToTry, rankSearchTitles, searchTerm } from "./meta/teams.mjs";

const root = new URL("..", import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(root, "data/meta-config.json"), "utf8"));
const roster = JSON.parse(readFileSync(join(root, "data/context.json"), "utf8")).heroes;
// Liquipedia asks for contact details in the User-Agent. Set them in the LIQUIPEDIA_CONTACT repository secret.
const CONTACT = process.env.LIQUIPEDIA_CONTACT?.trim();
const USER_AGENT = `MLBBDraftCoach/1.0 (https://github.com/KZY020821/mlbb-draft-coach${CONTACT ? `; ${CONTACT}` : ""})`;
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

// Every request to Liquipedia goes through here, at least 2.5 seconds apart.
let lastRequest = 0;
async function get(url, what) {
  // When Liquipedia rate limits us, wait (its Retry-After, or 2 then 5 then 10 minutes) and try again.
  const waits = [120, 300, 600];
  for (let attempt = 0; ; attempt++) {
    await sleep(Math.max(0, lastRequest + 2500 - Date.now()));
    lastRequest = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" } });
    if ((res.status !== 429 && res.status !== 503) || attempt >= waits.length) {
      if (!res.ok) throw new Error(`Liquipedia returned HTTP ${res.status} for ${what}: ${(await res.text()).slice(0, 200)}`);
      return res;
    }
    const after = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(after) && after > 0 ? Math.min(after, 900) : waits[attempt];
    console.log(`Liquipedia returned ${res.status} for ${what}; waiting ${wait}s before retrying.`);
    await sleep(wait * 1000);
  }
}

// Runs one action=query for several titles. Returns Map(requested title -> page or null),
// following normalisation ("_" to " ") and redirects.
async function query(titles, params) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 6) {
    const chunk = titles.slice(i, i + 6);
    const url = `${API}?action=query&format=json&formatversion=2&redirects=1&${params}&titles=${chunk.map(encodeURIComponent).join("|")}`;
    const res = await get(url, chunk.join(", "));
    const body = await res.text();
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`Liquipedia sent a non-JSON reply for ${chunk.join(", ")}: ${body.slice(0, 200)}`);
    }
    // A reply too large for one response comes back partial; say so rather than lose pages quietly.
    if (json?.continue) report(`Liquipedia split the reply for ${chunk.join(", ")}; some pages may be missing. Lower the batch size.`);
    const q = json?.query ?? {};
    const step = (list, t) => list?.find((x) => x.from === t)?.to ?? t;
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of chunk) {
      const page = pages.get(step(q.redirects, step(q.normalized, t)));
      // Logo files live in Liquipedia's shared file store, so they read as "missing" here but still have imageinfo.
      out.set(t, page && !page.invalid && (!page.missing || page.known || page.imageinfo) ? page : null);
    }
  }
  return out;
}

const contentOf = (page) => page?.revisions?.[0]?.slots?.main?.content ?? null;

const args = process.argv.slice(2);
const fromDir = args.includes("--from-dir") ? args[args.indexOf("--from-dir") + 1] : "";

// 1. Match pages of every league.
const allTitles = config.leagues.flatMap((l) => l.pages);
const fetched = fromDir ? null : await query(allTitles, "prop=revisions&rvprop=content&rvslots=main");
const games = [];
const pagesUsed = [];
for (const league of config.leagues) {
  let count = 0;
  for (const title of league.pages) {
    let text = null;
    if (fromDir) {
      const file = join(fromDir, title.replace(/[\\/]/g, "__") + ".wiki");
      text = existsSync(file) ? readFileSync(file, "utf8") : null;
    } else {
      text = contentOf(fetched.get(title));
    }
    if (!text) {
      console.log(`skip: ${title} (no page yet)`);
      continue;
    }
    const parsed = parseMatches(text, title).map((g) => ({ ...g, league: league.id }));
    console.log(`${title}: ${parsed.length} played games`);
    count += parsed.length;
    games.push(...parsed);
    pagesUsed.push(`https://liquipedia.net/mobilelegends/${title.replace(/ /g, "_")}`);
  }
  if (!count) report(`No games found for ${league.name}. Check its pages in data/meta-config.json.`);
}

if (!games.length) {
  report("No games found; leaving the data files unchanged.");
  process.exit(fromDir ? 1 : 0);
}

const overridesPath = join(root, "data/position-overrides.json");
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")).lineups ?? [] : [];

const { meta, lineups } = buildMeta(games, roster, {
  overrides,
  leagues: config.leagues.map(({ id, name, short, region }) => ({ id, name, short, region })),
  halfLifeDays: config.halfLifeDays,
  pages: pagesUsed,
  fetchedAt: new Date().toISOString()
});

// 2. Team logos. data/team-logos.json remembers which Liquipedia file each saved logo came from,
// so a logo is only downloaded when it is new or the team changed it.
const logosPath = join(root, "data/team-logos.json");
const logos = existsSync(logosPath) ? JSON.parse(readFileSync(logosPath, "utf8")) : {};
const logoDir = join(root, "public/teams");
const hasFile = (entry) => entry?.path && existsSync(join(root, "public", entry.path));

if (!fromDir) {
  try {
    await updateLogos(meta.teams);
  } catch (e) {
    // Logos are nice to have: keep the old ones and still publish the new pro data.
    report(`Could not update team logos: ${e.message}`);
  }
}

async function updateLogos(allTeams) {
  mkdirSync(logoDir, { recursive: true });
  // Logos rarely change, so only teams without one are looked up each week, and every team in the
  // first week of the month (or with --refresh-logos). Fewer requests to Liquipedia.
  const refreshAll = args.includes("--refresh-logos") || new Date().getUTCDate() <= 7;
  const teams = refreshAll ? allTeams : allTeams.filter((t) => !hasFile(logos[t.id]));
  if (!teams.length) return console.log("Every team has a logo; checking them all again in the first week of next month.");
  // Find each team's page and its logo file name.
  // A page found before is tried alone, so later weeks need fewer requests.
  const tries = new Map(
    teams.map((t) => [t.id, config.teamPages?.[t.id] || !logos[t.id]?.page ? pagesToTry(t, config.teamPages?.[t.id]) : [logos[t.id].page]])
  );
  const pages = await query([...new Set([...tries.values()].flat())], "prop=revisions&rvprop=content&rvslots=main");
  const want = new Map(); // team id -> { page, file }
  for (const t of teams) {
    for (const title of tries.get(t.id)) {
      const file = infoboxLogo(contentOf(pages.get(title)) ?? "");
      if (file) {
        want.set(t.id, { page: pages.get(title).title, file });
        break;
      }
    }
  }

  // Teams whose page wasn't found by name: search page titles starting with the name
  // ("Aurora PH" -> "Aurora..."), keeping pages for this team's region over other regions.
  const unfound = teams.filter((t) => !want.has(t.id) && !config.teamPages?.[t.id]);
  if (unfound.length) {
    const regions = Object.fromEntries(config.leagues.map((l) => [l.id, l.region]));
    const options = new Map();
    for (const t of unfound) {
      const res = await get(
        `${API}?action=query&format=json&formatversion=2&list=prefixsearch&psnamespace=0&pslimit=10&pssearch=${encodeURIComponent(searchTerm(t.name))}`,
        `search for ${t.name}`
      );
      const titles = ((await res.json())?.query?.prefixsearch ?? []).map((x) => x.title);
      options.set(t.id, rankSearchTitles(titles, t.league, regions));
    }
    const found = await query([...new Set([...options.values()].flat())], "prop=revisions&rvprop=content&rvslots=main");
    for (const t of unfound) {
      for (const title of options.get(t.id)) {
        const file = infoboxLogo(contentOf(found.get(title)) ?? "");
        if (file) {
          want.set(t.id, { page: found.get(title).title, file });
          console.log(`Found ${t.name} (${t.id}) by search: ${found.get(title).title}. If that's the wrong team, set teamPages in data/meta-config.json.`);
          break;
        }
      }
    }
  }
  for (const t of teams) {
    if (!want.has(t.id)) console.log(`No logo found for ${t.name} (${t.id}); tried ${tries.get(t.id).join(", ")} and a title search.`);
  }
  const stale = [...want].filter(([id, w]) => !(logos[id]?.file === w.file && hasFile(logos[id])));
  if (!stale.length) return console.log("Team logos are up to date.");

  // Ask for a small rendering of each new logo, then download it.
  const files = await query(
    [...new Set(stale.map(([, w]) => `File:${w.file}`))],
    "prop=imageinfo&iiprop=url&iiurlwidth=96"
  );
  for (const [id, w] of stale) {
    const info = files.get(`File:${w.file}`)?.imageinfo?.[0];
    const url = info?.thumburl || info?.url;
    if (!url) {
      console.log(`No image URL for ${w.file} (${id}).`);
      continue;
    }
    const ext = (url.match(/\.(png|jpe?g|webp|gif|svg)(?:$|\?)/i)?.[1] ?? "png").toLowerCase().replace("jpeg", "jpg");
    const path = `/teams/${id}.${ext}`;
    const res = await get(url, w.file);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (hasFile(logos[id]) && logos[id].path !== path) unlinkSync(join(root, "public", logos[id].path));
    writeFileSync(join(root, "public", path), bytes);
    logos[id] = { page: w.page, file: w.file, path };
    console.log(`Saved the ${id} logo from ${w.file}.`);
  }
  writeFileSync(logosPath, JSON.stringify(logos, null, 1) + "\n");
}

// The app only needs each team's logo path; the page names were for finding it.
meta.teams = meta.teams.map(({ pages, ...t }) => ({ ...t, logo: hasFile(logos[t.id]) ? logos[t.id].path : null }));

const credit = {
  source: "Liquipedia",
  license: "CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)",
  pages: pagesUsed,
  note: "Positions are inferred from picks, not taken from Liquipedia."
};

// Only rewrite the files when the data changed, so the weekly job makes no empty commits.
const strip = (o) => JSON.stringify({ ...o, source: { ...o.source, fetchedAt: "" } });
const metaPath = join(root, "data/meta.json");
const old = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : null;
if (old && strip(old) === strip(meta)) {
  console.log("No changes in the pro data.");
} else {
  writeFileSync(metaPath, JSON.stringify(meta, null, 1) + "\n");
  writeFileSync(join(root, "data/pro-games.json"), JSON.stringify({ ...credit, lineups }, null, 1) + "\n");
  console.log(`Wrote data/meta.json: ${meta.games} games, latest ${meta.latestGame}.`);
  for (const l of meta.leagues) console.log(`  ${l.name}: ${l.games} games, ${l.teams} teams, latest ${l.latestGame || "-"}`);
}
if (meta.unknownHeroes.length) console.log("Unknown hero ids (add to HERO_ALIASES):", meta.unknownHeroes.join(", "));
console.log("Average position confidence:", meta.positionConfidence);
