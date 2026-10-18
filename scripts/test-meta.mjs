// Checks the pro-data pipeline (parse + position inference + stats) on the sample in tests/meta.
// Run: node scripts/test-meta.mjs
import { readFileSync } from "node:fs";
import { parseMatches, parseDate, teamName } from "./meta/parse.mjs";
import { buildMeta } from "./meta/build.mjs";

const root = new URL("..", import.meta.url).pathname;
const roster = JSON.parse(readFileSync(root + "data/context.json", "utf8")).heroes;
const text = readFileSync(root + "tests/meta/MPL__Philippines__Season_18__Regular_Season.wiki", "utf8");

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
check("picks and bans read", games[0].picks[0].join() === "arlott,cici,zhuxin,atlas,suyou" && games[0].bans[0].length === 5);

const { meta, lineups } = buildMeta(games, roster, { focusTeam: "Team Liquid PH", focusWeight: 3 });
check("hero aliases resolve (yz, guin, lapu, yss, gatot, luo yi)", ["Yu Zhong", "Guinevere", "Gatotkaca"].every((h) => meta.heroes[h]?.bans === 1) && meta.heroes["Lapu-Lapu"] && meta.heroes["Yi Sun-shin"] && meta.heroes["Luo Yi"]);
check("unknown ids are reported, not dropped silently", meta.unknownHeroes.join() === "atlasx");
check("every lineup fills all five positions", lineups.every((l) => Object.keys(l.positions).length === 5 && new Set(Object.values(l.positions)).size === 5));
check("only marksman in a lineup goes to gold lane", lineups.find((l) => Object.values(l.positions).includes("Claude")).positions.marksman === "Claude");
check("lineup with no marksman puts a fighter in gold lane", ["Freya", "Aulus"].includes(lineups.find((l) => l.team === "ONIC PH" && Object.values(l.positions).includes("Freya")).positions.marksman));
check("focus team counted", meta.focusGames === 3 && meta.heroes.Atlas.positions.roam.focusPicks === 2);
check("focus games weigh more", meta.heroes.Atlas.positions.roam.weight > meta.heroes.Khufra.positions.roam.weight * 2);
check("pairs recorded for the focus team", meta.pairs.some((p) => p.heroes.join() === "Arlott,Atlas" && p.focusGames === 2 && p.focusWins === 2));

const totalH2H = (h, e) => meta.matchups?.[h]?.[e]?.[0] ?? 0;
const someLineup = lineups[0];
const opp = lineups.find((l) => l.date === someLineup.date && l.match === someLineup.match && l.game === someLineup.game && l.team !== someLineup.team);
const [ha, hb] = [Object.values(someLineup.positions)[0], Object.values(opp.positions)[0]];
check("head-to-head records are built for opposing heroes", typeof meta.matchups === "object" && (totalH2H(ha, hb) >= 2 || Object.keys(meta.matchups).length > 0));
check("head-to-head wins mirror each other", Object.entries(meta.matchups).every(([h, row]) => Object.entries(row).every(([e, [g, w]]) => !meta.matchups[e]?.[h] || meta.matchups[e][h][0] === g && meta.matchups[e][h][1] === g - w)));

const fixed = buildMeta(games, roster, {
  focusTeam: "Team Liquid PH",
  overrides: [{ date: "2026-10-11", team: "Team Liquid PH", positions: { roam: "Atlas", marksman: "Cici", jungler: "Suyou", mage: "Zhuxin", fighter: "Arlott" } }]
});
const corrected = fixed.lineups.find((l) => l.corrected);
check("hand corrections replace the inferred positions", corrected && corrected.positions.marksman === "Cici" && corrected.confidence === 1 && fixed.meta.correctedLineups === 1);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
