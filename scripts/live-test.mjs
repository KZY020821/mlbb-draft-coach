// Runs the saved drafts in tests/drafts against a running site and prints what it suggests.
// Usage: APP_URL=https://mlbb-draft-coach-six.vercel.app node scripts/live-test.mjs [file ...]
// With no files, every draft in tests/drafts is run. This calls the real model, so it costs a little.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const dir = new URL("../tests/drafts/", import.meta.url).pathname;
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));

let failed = 0;
for (const file of files) {
  const t = JSON.parse(readFileSync(file, "utf8"));
  const started = Date.now();
  const res = await fetch(APP + "/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.APP_PASSCODE ? { "x-passcode": process.env.APP_PASSCODE } : {}) },
    body: JSON.stringify(t.draft)
  });
  const body = await res.json().catch(() => null);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n== ${t.name} (${secs}s, HTTP ${res.status})`);
  if (!res.ok) { console.log("   error:", body?.error?.message); failed++; continue; }

  const a = body.analysis;
  console.log(`   open positions: ${body.open.join(", ")}`);
  a.picks.forEach((p, i) => console.log(`   pick ${i + 1}: ${p.hero} (${p.position}) - ${p.why}${p.risk ? ` Risk: ${p.risk}` : ""}`));
  if (a.backups.length) console.log("   backups:", a.backups.map((b) => `${b.hero} (${b.position})`).join(", "));
  if (body.rules.length) console.log("   rules:", body.rules.map((r) => (r.teamHas ? `${r.enemy} already countered by ${r.teamHas}` : `${r.enemy} -> ${r.available.join(" or ")}`)).join("; "));
  console.log(`   confidence: ${a.confidence} | retried: ${body.meta.retried} | model: ${body.meta.model}`);

  const e = t.expect || {};
  const problems = [];
  if (e.need && body.need !== e.need) problems.push(`expected ${e.need} pick(s), got ${body.need}`);
  if (e.positions) {
    const got = a.picks.map((p) => p.position).sort().join(",");
    if (got !== [...e.positions].sort().join(",")) problems.push(`expected picks for ${e.positions.join(", ")}, got ${got || "none"}`);
  }
  for (const r of e.rules || []) {
    const got = body.rules.find((x) => x.enemy === r.enemy);
    if (!got) problems.push(`rule for ${r.enemy} did not apply`);
    else if ("teamHas" in r && got.teamHas !== r.teamHas) problems.push(`rule for ${r.enemy}: expected teamHas ${r.teamHas}, got ${got.teamHas}`);
  }
  for (const p of a.picks) if ((e.notPicked || []).includes(p.hero)) problems.push(`${p.hero} is already banned or picked`);
  if (problems.length) { failed++; problems.forEach((p) => console.log("   FAIL:", p)); } else console.log("   PASS");
}
process.exit(failed ? 1 : 0);
