#!/usr/bin/env node
// Opens the draft coach in your browser with the boxes already filled in.
// You still click "Analyze draft" yourself.
//
// From a saved draft:
//   node scripts/open-draft.mjs tests/drafts/gloo-faramis-last-pick.json
// From names you type (bans and enemy are comma-separated; our picks go by position):
//   node scripts/open-draft.mjs --bans "Hirara,Freya,Kaja" --enemy "Tigreal,Gloo" \
//     --marksman Hanabi --jungler Fanny --mage Faramis --fighter "Yu Zhong"
// Leave a position out to mark it open. Add --print to only print the link.
// Set APP_URL to use another site, e.g. APP_URL=http://localhost:3000

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const APP = (process.env.APP_URL || "https://mlbb-draft-coach-six.vercel.app").replace(/\/+$/, "");
const POSITIONS = ["roam", "marksman", "jungler", "mage", "fighter"];
const VALUE_FLAGS = ["--bans", "--enemy", ...POSITIONS.map((p) => `--${p}`)];
const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1].trim() : "";
}
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

let bans = list(flag("bans"));
let enemy = list(flag("enemy"));
let team = Object.fromEntries(POSITIONS.map((p) => [p, flag(p)]));

const file = args.find((a, i) => a.endsWith(".json") && !(i > 0 && VALUE_FLAGS.includes(args[i - 1])));
if (file) {
  const saved = JSON.parse(readFileSync(file, "utf8"));
  const d = saved.draft ?? saved;
  bans = d.bans ?? [];
  enemy = d.enemyPicks ?? [];
  team = Object.fromEntries(POSITIONS.map((p) => [p, (d.teamPicks ?? {})[p] ?? ""]));
}

const anyTeam = POSITIONS.some((p) => team[p]);
if (!bans.length && !enemy.length && !anyTeam) {
  console.error("Give a saved draft file, or at least one of --bans, --enemy, --roam, --marksman, --jungler, --mage, --fighter.");
  process.exit(1);
}

// Keep commas readable; encode each name on its own (spaces become %20).
const part = (key, names) => (names.length ? `${key}=${names.map(encodeURIComponent).join(",")}` : "");
const query = [part("bans", bans), part("enemy", enemy), ...POSITIONS.map((p) => part(p, team[p] ? [team[p]] : []))]
  .filter(Boolean)
  .join("&");
const url = `${APP}/?${query}`;

console.log(url);
if (args.includes("--print")) process.exit(0);

const [cmd, cmdArgs] =
  process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
const child = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true });
child.on("error", () => console.error("Could not open a browser. Copy the link above into your browser instead."));
child.unref();
