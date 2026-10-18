// Checks the pro-data pipeline (parse + position inference + stats) on the sample in tests/meta.
// Run: node scripts/test-meta.mjs
import { readFileSync } from "node:fs";
import { parseMatches, parseDate, teamName } from "./meta/parse.mjs";
import { buildMeta, teamId } from "./meta/build.mjs";
import { infoboxLogo, pagesToTry } from "./meta/teams.mjs";

const root = new URL("..", import.meta.url).pathname;
const roster = JSON.parse(readFileSync(root + "data/context.json", "utf8")).heroes;
const text = readFileSync(root + "tests/meta/MPL__Philippines__Season_18__Regular_Season.wiki", "utf8");
const textId = readFileSync(root + "tests/meta/MPL__Indonesia__Season_18__Regular_Season.wiki", "utf8");
const LEAGUES = [
  { id: "id", name: "MPL Indonesia Season 18", short: "MPL ID", region: "Indonesia" },
  { id: "ph", name: "MPL Philippines Season 18", short: "MPL PH", region: "Philippines" }
];

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  -> " + extra : ""));
  if (!ok) failed++;
};

const games = parseMatches(text, "test");
check("parses played games only (unplayed map skipped)", games.length === 3, String(games.length));
check("team names are normalised", games[0].teams.join() === "Team Liquid PH,ONIC PH" && games[2].teams[0] === "AP.Bren");
check("team aliases", teamName("Onic PH") === "ONIC PH" && teamName("TEam Falcons PH") === "Team Falcons PH" && teamName("Ap.Bren") === "AP.Bren");
check("date parsed", games[0].date === "2026-10-09" && games[2].date === "2026-10-11");
check(
  "date formats seen on Liquipedia",
  parseDate("Oct 9, 2026 - 17:00 {{Abbr/SGT}}") === "2026-10-09" &&
    parseDate("August 23 , 2026 - 17:00") === "2026-08-23" &&
    parseDate("August 28 ,2026 - 19:30") === "2026-08-28" &&
    parseDate("Sept. 5, 2026") === "2026-09-05" &&
    parseDate("2026-10-11 17:00") === "2026-10-11" &&
    parseDate("TBD") === ""
);
check("winner and sides", games[0].winner === 0 && games[1].winner === 1 && games[1].sides.join() === "red,blue");
check("names as written on the page are kept for logos", games[0].teamPages.join() === "Team Liquid PH,ONIC Philippines");
check("picks and bans read", games[0].picks[0].join() === "arlott,cici,zhuxin,atlas,suyou" && games[0].bans[0].length === 5);

const { meta, lineups } = buildMeta(games.map((g) => ({ ...g, league: "ph" })), roster, { leagues: LEAGUES });
check("hero aliases resolve (yz, guin, lapu, yss, gatot, luo yi)", ["Yu Zhong", "Guinevere", "Gatotkaca"].every((h) => meta.heroes[h]?.bans === 1) && meta.heroes["Lapu-Lapu"] && meta.heroes["Yi Sun-shin"] && meta.heroes["Luo Yi"]);
check("unknown ids are reported, not dropped silently", meta.unknownHeroes.join() === "atlasx");
check("every lineup fills all five positions", lineups.every((l) => Object.keys(l.positions).length === 5 && new Set(Object.values(l.positions)).size === 5));
check("only marksman in a lineup goes to gold lane", lineups.find((l) => Object.values(l.positions).includes("Claude")).positions.marksman === "Claude");
check("lineup with no marksman puts a fighter in gold lane", ["Freya", "Aulus"].includes(lineups.find((l) => l.team === "ONIC PH" && Object.values(l.positions).includes("Freya")).positions.marksman));
const tlph = meta.teams.find((t) => t.id === "ph-teamliquidph");
check("each team's own picks are kept", tlph && tlph.games === 3 && tlph.wins === 2 && tlph.heroes.Atlas.roam[0] === 2 && tlph.heroes.Atlas.roam[1] === 2);
check("team pages kept for logo lookup", tlph.pages.join() === "Team Liquid PH");
check("no team gets extra weight in the league stats", meta.heroes.Atlas.positions.roam.weight < meta.heroes.Atlas.positions.roam.picks + 0.01);
check("pairs recorded", meta.pairs.some((p) => p.heroes.join() === "Arlott,Atlas" && p.games === 2 && p.wins === 2));

// Several leagues pooled: hero stats combine, teams stay per league.
const both = buildMeta(
  [...games.map((g) => ({ ...g, league: "ph" })), ...parseMatches(textId, "id").map((g) => ({ ...g, league: "id" }))],
  roster,
  { leagues: LEAGUES }
).meta;
check("leagues are pooled for hero stats", both.games === 5 && both.heroes.Claude.picks === meta.heroes.Claude.picks + 2);
check("per-league counts", both.leagues.map((l) => `${l.id}:${l.games}:${l.teams}`).join() === "id:2:2,ph:3:3", both.leagues.map((l) => `${l.id}:${l.games}:${l.teams}`).join());
check("teams listed in league order", both.teams[0].league === "id" && both.teams.at(-1).league === "ph");
check("team ids", teamId("id", "RRQ Hoshi") === "id-rrqhoshi" && both.teams.some((t) => t.id === "id-rrqhoshi" && t.wins === 2));

check("logo: dark-mode file preferred", infoboxLogo(readFileSync(root + "tests/meta/team-page.wiki", "utf8")) === "Team Liquid 2024 darkmode.png");
check("logo: light file when no dark one", infoboxLogo("{{Infobox team\n|image=File:ONIC.png\n}}") === "ONIC.png" && infoboxLogo("no infobox") === "");
check("logo: pages tried in order", pagesToTry({ name: "ONIC PH", pages: ["onic ph"] }, "ONIC Philippines").join() === "ONIC Philippines,Onic ph,ONIC PH");

const totalH2H = (h, e) => meta.matchups?.[h]?.[e]?.[0] ?? 0;
const someLineup = lineups[0];
const opp = lineups.find((l) => l.date === someLineup.date && l.match === someLineup.match && l.game === someLineup.game && l.team !== someLineup.team);
const [ha, hb] = [Object.values(someLineup.positions)[0], Object.values(opp.positions)[0]];
check("head-to-head records are built for opposing heroes", typeof meta.matchups === "object" && (totalH2H(ha, hb) >= 2 || Object.keys(meta.matchups).length > 0));
check("head-to-head wins mirror each other", Object.entries(meta.matchups).every(([h, row]) => Object.entries(row).every(([e, [g, w]]) => !meta.matchups[e]?.[h] || meta.matchups[e][h][0] === g && meta.matchups[e][h][1] === g - w)));

const fixed = buildMeta(games, roster, {
  overrides: [{ date: "2026-10-11", team: "Team Liquid PH", positions: { roam: "Atlas", marksman: "Cici", jungler: "Suyou", mage: "Zhuxin", fighter: "Arlott" } }]
});
const corrected = fixed.lineups.find((l) => l.corrected);
check("hand corrections replace the inferred positions", corrected && corrected.positions.marksman === "Cici" && corrected.confidence === 1 && fixed.meta.correctedLineups === 1);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
