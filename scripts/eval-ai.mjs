#!/usr/bin/env node
// AI quality check: replays recent pro games with one of the winning team's picks hidden and asks
// the coach for that position. A "hit" is when the hero the pros actually locked in is among the
// coach's 3 options. Run against an app started with a real DEEPSEEK_API_KEY (and accounts off):
//   APP_URL=http://127.0.0.1:3000 node scripts/eval-ai.mjs [--cases 20] [--with-team] [--out report.md]
// --with-team also tells the coach to draft like the team that played, to measure the team weighting.
//
// Caveat: these games are also in the pro data the coach scores with, so hit rates are optimistic.
// Use the numbers to compare versions of the coach, not as an absolute accuracy.
import { readFileSync, writeFileSync } from "node:fs";

const APP = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const CASES = Math.max(1, Number(opt("--cases", 20)) || 20);
const WITH_TEAM = args.includes("--with-team");
const OUT = opt("--out", "");
const POSITIONS = ["roam", "marksman", "jungler", "mage", "fighter"];
const LABEL = { roam: "Roam", marksman: "Marksman", jungler: "Jungler", mage: "Mage", fighter: "Fighter" };
const idOf = (s) => String(s).toLowerCase().replace(/\band\b/g, " ").replace(/[^a-z0-9]/g, "");

// The most recent games, one case per game: the winning lineup (positions inferred with high
// confidence) against the losing one, hiding a different position each time.
const { lineups } = JSON.parse(readFileSync(new URL("../data/pro-games.json", import.meta.url), "utf8"));
const games = new Map();
for (const l of lineups) {
  const key = `${l.match}#${l.game}`;
  if (!games.has(key)) games.set(key, []);
  games.get(key).push(l);
}
const pairs = [...games.values()]
  .filter((g) => g.length === 2)
  .map((g) => ({ win: g.find((l) => l.won), lose: g.find((l) => !l.won) }))
  .filter((p) => p.win && p.lose && p.win.confidence >= 0.8)
  .sort((a, b) => b.win.date.localeCompare(a.win.date))
  .slice(0, CASES);

const cases = pairs.map((p, i) => {
  const hidden = POSITIONS[i % POSITIONS.length];
  const teamPicks = Object.fromEntries(POSITIONS.filter((x) => x !== hidden).map((x) => [x, p.win.positions[x]]));
  return {
    label: `${p.win.date} ${p.win.team} vs ${p.lose.team}`,
    hidden,
    answer: p.win.positions[hidden],
    body: {
      bans: [],
      enemyPicks: POSITIONS.map((x) => p.lose.positions[x]),
      teamPicks,
      ...(WITH_TEAM ? { team: `${p.win.league}-${idOf(p.win.team)}` } : {})
    }
  };
});

const rows = [];
for (const c of cases) {
  const started = Date.now();
  const res = await fetch(`${APP}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.APP_PASSCODE ? { "x-passcode": process.env.APP_PASSCODE } : {}) },
    body: JSON.stringify(c.body)
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
  const data = await res.json().catch(() => null);
  const options = data?.analysis?.slots?.find((s) => s.position === c.hidden)?.options?.map((o) => o.hero) ?? [];
  const rank = options.indexOf(c.answer) + 1;
  rows.push({ ...c, status: res.status, error: res.ok ? "" : data?.error?.message ?? `HTTP ${res.status}`, options, rank, ms: Date.now() - started });
  console.log(`${res.ok ? (rank ? `hit #${rank}` : "miss  ") : "ERROR "}  ${c.label} · ${LABEL[c.hidden]}: pros ${c.answer} · coach ${options.join(", ") || "-"}${res.ok ? "" : ` · ${rows.at(-1).error}`}`);
}

const ok = rows.filter((r) => !r.error);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "-");
const hit1 = ok.filter((r) => r.rank === 1).length;
const hit3 = ok.filter((r) => r.rank >= 1).length;
const lines = [
  `# AI quality check${WITH_TEAM ? " (drafting like the team that played)" : ""}`,
  "",
  `${ok.length} of ${rows.length} cases answered · pro pick as option #1: **${pct(hit1, ok.length)}** · among the 3 options: **${pct(hit3, ok.length)}** · average ${Math.round(ok.reduce((a, r) => a + r.ms, 0) / (ok.length || 1))} ms`,
  "",
  "| Position | Cases | #1 | Top 3 |",
  "| --- | ---: | ---: | ---: |",
  ...POSITIONS.map((p) => {
    const rs = ok.filter((r) => r.hidden === p);
    return `| ${LABEL[p]} | ${rs.length} | ${pct(rs.filter((r) => r.rank === 1).length, rs.length)} | ${pct(rs.filter((r) => r.rank >= 1).length, rs.length)} |`;
  }),
  "",
  "| Game | Position | Pros picked | Coach suggested | Result |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.label} | ${LABEL[r.hidden]} | ${r.answer} | ${r.options.join(", ") || "-"} | ${r.error ? `error: ${r.error}` : r.rank ? `hit #${r.rank}` : "miss"} |`),
  "",
  "These games are also in the coach's pro data, so the rates are optimistic. Compare runs, don't read them as absolute accuracy."
];
const report = lines.join("\n");
console.log("\n" + report);
if (OUT) writeFileSync(OUT, report + "\n");
process.exit(ok.length ? 0 : 1);
