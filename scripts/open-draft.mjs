#!/usr/bin/env node
// Opens the draft coach in your browser with the boxes already filled in.
// You still click "Analyze draft" yourself.
//
// From a saved draft:
//   node scripts/open-draft.mjs tests/drafts/gloo-faramis-last-pick.json
// From names you type (comma-separated):
//   node scripts/open-draft.mjs --bans "Hirara,Freya,Kaja" --enemy "Tigreal,Gloo" --ours "Hanabi,Yu Zhong"
// Add --print to only print the link instead of opening it.
// Set APP_URL to use another site, e.g. APP_URL=http://localhost:3000

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const APP = (process.env.APP_URL || "https://mlbb-draft-coach-six.vercel.app").replace(/\/+$/, "");
const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "";
}
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

let bans = list(flag("bans"));
let enemy = list(flag("enemy"));
let ours = list(flag("ours"));

const VALUE_FLAGS = ["--bans", "--enemy", "--ours"];
const file = args.find((a, i) => a.endsWith(".json") && !(i > 0 && VALUE_FLAGS.includes(args[i - 1])));
if (file) {
  const saved = JSON.parse(readFileSync(file, "utf8"));
  const d = saved.draft ?? saved;
  bans = d.bans ?? [];
  enemy = d.enemyPicks ?? d.enemy ?? [];
  ours = d.teamPicks ?? d.ours ?? [];
}

if (!bans.length && !enemy.length && !ours.length) {
  console.error("Give a saved draft file or at least one of --bans, --enemy, --ours.");
  console.error('Example: node scripts/open-draft.mjs --enemy "Gloo,Ling" --ours "Hanabi"');
  process.exit(1);
}

// Keep commas readable; encode each name on its own (spaces become %20).
const part = (key, names) => (names.length ? `${key}=${names.map(encodeURIComponent).join(",")}` : "");
const query = [part("bans", bans), part("enemy", enemy), part("ours", ours)].filter(Boolean).join("&");
const url = `${APP}/?${query}`;

console.log(url);
if (args.includes("--print")) process.exit(0);

const [cmd, cmdArgs] =
  process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
const child = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true });
child.on("error", () => console.error("Could not open a browser. Copy the link above into your browser instead."));
child.unref();
