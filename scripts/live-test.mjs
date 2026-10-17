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
  for (const slot of a.slots) {
    console.log(`   ${slot.position}:`);
    slot.options.forEach((o, i) => console.log(`     ${i + 1}. ${o.hero} [${o.confidence}${o.tags.length ? ", " + o.tags.join("/") : ""}] - ${o.evidence}\n        ${o.why}`));
  }
  if (body.rules.length) console.log("   rules:", body.rules.map((r) => (r.teamHas ? `${r.enemy} already countered by ${r.teamHas}` : `${r.enemy} -> ${r.available.join(" or ") || "none fits"}`)).join("; "));
  console.log(`   retried: ${body.meta.retried} | model: ${body.meta.model} | pro data: ${body.meta.pro.games} games to ${body.meta.pro.latestGame}`);

  const e = t.expect || {};
  const problems = [];
  if (e.need && body.need !== e.need) problems.push(`expected ${e.need} pick(s), got ${body.need}`);
  if (e.positions) {
    const got = a.slots.map((s) => s.position).sort().join(",");
    if (got !== [...e.positions].sort().join(",")) problems.push(`expected options for ${e.positions.join(", ")}, got ${got || "none"}`);
  }
  for (const slot of a.slots) if (slot.options.length !== 3) problems.push(`${slot.position} has ${slot.options.length} options, expected 3`);
  for (const r of e.rules || []) {
    const got = body.rules.find((x) => x.enemy === r.enemy);
    if (!got) problems.push(`rule for ${r.enemy} did not apply`);
    else if ("teamHas" in r && got.teamHas !== r.teamHas) problems.push(`rule for ${r.enemy}: expected teamHas ${r.teamHas}, got ${got.teamHas}`);
  }
  for (const o of a.slots.flatMap((x) => x.options)) if ((e.notPicked || []).includes(o.hero)) problems.push(`${o.hero} should not be suggested here`);
  if (problems.length) { failed++; problems.forEach((p) => console.log("   FAIL:", p)); } else console.log("   PASS");
}
process.exit(failed ? 1 : 0);
