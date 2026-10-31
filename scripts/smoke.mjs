// End-to-end checks against a running app (default http://127.0.0.1:3100) and the mock.
import { readFileSync } from "node:fs";

const APP = process.env.APP_URL || "http://127.0.0.1:3100";
const MOCK = "http://127.0.0.1:4010";
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  -> " + extra : "")); if (!ok) failed++; };
const setMode = (mode) => fetch(MOCK + "/__mode", { method: "POST", body: JSON.stringify({ mode }) });
const post = async (body, headers = {}) => {
  const r = await fetch(APP + "/api/analyze", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const lastCall = async () => (await fetch(MOCK + "/__last")).json();
const heroes = (r) => JSON.stringify(r.json?.analysis?.slots?.map((s) => `${s.position}: ${s.options.map((o) => o.hero).join(", ")}`));
const allOptions = (r) => (r.json?.analysis?.slots ?? []).flatMap((s) => s.options.map((o) => o.hero));

// Open positions: jungler and mage.
const draft = {
  bans: ["Hayabusa", "Freya", "Atlas", "Fanny", "Selena"],
  enemyPicks: ["Ling", "Layla", "Gatotkaca", "Kagura", "Angela"],
  teamPicks: { roam: "Tigreal", marksman: "Miya", fighter: "Bane" }
};

await setMode("good");
let r = await post(draft);
check("two open positions -> 2 slots of 3 options", r.status === 200 && r.json.analysis.slots.length === 2 && r.json.analysis.slots.every((s) => s.options.length === 3) && r.json.analysis.slots.map((s) => s.position).sort().join() === "jungler,mage", heroes(r));
check("options carry pro evidence and tags", r.json.analysis.slots.every((s) => s.options.every((o) => o.evidence && Array.isArray(o.tags) && o.tags.length)));
check("response credits the pro data source", r.json.meta.pro && r.json.meta.pro.source === "Liquipedia" && r.json.meta.pro.license.includes("CC BY-SA"));
check("response lists the open positions", JSON.stringify(r.json.open) === '["jungler","mage"]');
check("meta carries patch + model", r.json.meta.patch === "2.2.16" && r.json.meta.model === "deepseek-flash", JSON.stringify(r.json.meta));
let lc = await lastCall();
check("API key sent as bearer token", lc.last.auth === "Bearer test-key");
check("hits the chat completions path", lc.last.url === "/chat/completions");
check("JSON mode requested", lc.last.body.response_format?.type === "json_object");
check("DeepSeek thinking is turned off", lc.last.body.thinking?.type === "disabled" && !("reasoning_effort" in lc.last.body));
const sys = lc.last.body.messages[0].content, usr = lc.last.body.messages[1].content;
check("prompt includes patch notes and the pro data summary", sys.includes("Patch 2.2.16") && sys.includes("Masha was reworked") && sys.includes("pro games up to") && sys.includes("MPL"));
check("no pro team chosen -> no team gets extra weight", sys.includes("One team's record is not a reason on its own") && !sys.includes("chose to draft like") && r.json.meta.pro.team === null);
check("full tier dump is gone; candidates instead", !sys.includes("ROSTER AND TIERS") && usr.includes("CANDIDATES (with pro evidence)") && usr.includes("choose 3 from these candidates only"));
check("candidate lines carry pro numbers", /pro picks in (jungle|mid lane), \d+ wins/.test(usr));
check("prompt says to trust the listed roles", sys.includes("Do not call a hero tanky or a frontliner unless its roles include Tank"));
check("prompt mentions JSON (required by JSON mode)", /json/i.test(sys));
check("prompt lists our picks by position", usr.includes("- Roam: Tigreal") && usr.includes("- Jungler: OPEN") && usr.includes("- Mage (mid lane): OPEN"));
check("prompt names the open positions", usr.includes("Open positions: Jungler, Mage (mid lane)") && usr.includes("one slot per open position"));

r = await post({ ...draft, teamPicks: { roam: "Tigreal", marksman: "Miya", fighter: "Bane", jungler: "Khufra" } });
check("one open position -> 1 slot of 3 for it", r.status === 200 && r.json.analysis.slots.length === 1 && r.json.analysis.slots[0].position === "mage" && r.json.analysis.slots[0].options.length === 3, heroes(r));

r = await post({ ...draft, teamPicks: { roam: "Tigreal", marksman: "Miya" } });
lc = await lastCall();
check("three open positions -> asks for the 2 that matter most", r.status === 200 && r.json.need === 2 && lc.last.body.messages[1].content.includes("Give slots for the 2 that matter most"));

await setMode("wrong_position_then_good");
r = await post(draft);
lc = await lastCall();
check("hero off the candidate list triggers a retry", lc.calls === 2 && JSON.stringify(lc.last.body.messages).includes("Barats is not on the candidate list for Mage") && r.status === 200, heroes(r));
check("the off-list hero is not shown", !allOptions(r).includes("Barats"));

await setMode("short_then_good");
r = await post(draft);
lc = await lastCall();
check("fewer than 3 options triggers a retry", lc.calls === 2 && JSON.stringify(lc.last.body.messages).includes("give exactly 3") && r.json.analysis.slots.every((s) => s.options.length === 3));

await setMode("bad_then_good");
r = await post(draft);
lc = await lastCall();
check("invented/banned heroes trigger one retry and recover", r.status === 200 && lc.calls === 2 && r.json.meta.retried === true && r.json.analysis.slots.length === 2 && !allOptions(r).includes("Hayabusa"), "calls=" + lc.calls);
check("retry message names the problems", JSON.stringify(lc.last.body.messages).includes("Notahero"));

await setMode("always_bad");
r = await post(draft);
check("still-bad reply -> 502 unusable_reply", r.status === 502 && r.json.error.code === "unusable_reply", r.json?.error?.code);

await setMode("empty_then_good");
r = await post(draft);
lc = await lastCall();
check("empty reply is retried once", r.status === 200 && lc.calls === 2);

await setMode("not_json");
r = await post(draft);
check("non-JSON reply -> 502, no crash", r.status === 502, String(r.status));

await setMode("401");
r = await post(draft);
check("bad key -> generic message, no key details", r.status === 502 && !/key/i.test(r.json.error.message) && r.json.error.code === "bad_key", r.json?.error?.message);

await setMode("402");
r = await post(draft);
check("no balance -> generic message", r.status === 502 && r.json.error.code === "no_balance");

await setMode("429");
r = await post(draft);
check("upstream 429 -> 503 busy", r.status === 503 && r.json.error.code === "busy");

await setMode("good");
const bad = [
  ["unknown hero", { ...draft, bans: ["Hayabusa", "Zzzhero"] }, "Zzzhero"],
  ["unknown hero in a position", { ...draft, teamPicks: { roam: "Zzzhero" } }, "Zzzhero"],
  ["duplicate hero", { ...draft, bans: ["Hayabusa", "hayabusa"] }, "only once"],
  ["hero in bans and picks", { ...draft, teamPicks: { roam: "Ling" } }, "only once"],
  ["team already full", { ...draft, teamPicks: { roam: "Tigreal", marksman: "Miya", jungler: "Khufra", mage: "Lylia", fighter: "Grock" } }, "five picks"],
  ["team picks as a plain list", { ...draft, teamPicks: ["Tigreal"] }, "by position"],
  ["unknown position", { ...draft, teamPicks: { support: "Tigreal" } }, "Unknown team position"],
  ["too many bans", { ...draft, bans: Array(11).fill("Hayabusa") }, "at most 10"],
  ["empty draft", { bans: [], enemyPicks: [], teamPicks: {} }, "at least one"],
  ["wrong types", { bans: "Hayabusa" }, "list"]
];
for (const [name, body, frag] of bad) {
  r = await post(body);
  check("rejects: " + name, r.status === 400 && r.json.error.message.includes(frag), r.json?.error?.message);
}
r = await post({ ...draft, bans: ["popol and kupa", "POPOL & KUPA"] });
check("name matching is forgiving but still catches duplicates", r.status === 400 && r.json.error.message.includes("Popol & Kupa"));
r = await post({ ...draft, bans: ["  hayabusa  ", "FREYA"], teamPicks: { roam: " tigreal ", marksman: "MIYA", fighter: "bane" } });
check("whitespace and case are tolerated", r.status === 200);
r = await post({ ...draft, enemyPicks: ["Ling", "Soyou"] });
check("Soyou is accepted as Suyou", r.status === 200 && r.json.meta && (await lastCall()).last.body.messages[1].content.includes("Enemy picks: Ling (Assassin), Suyou ("));
r = await post({ ...draft, enemyPicks: ["Suyou", "soyou"] });
check("Soyou and Suyou are the same hero", r.status === 400 && r.json.error.message.includes("Suyou"));

const health = await fetch(APP + "/api/health");
const hj = await health.json().catch(() => null);
check("health endpoint answers ok without calling the AI", health.status === 200 && hj?.ok === true && hj.proGames > 0 && typeof hj.patchDataAgeDays === "number");

const page = await fetch(APP + "/");
check("security headers are sent", page.headers.get("x-frame-options") === "DENY" && (page.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'") && page.headers.get("x-content-type-options") === "nosniff");

const big = await fetch(APP + "/api/analyze", { method: "POST", body: "x".repeat(5000) });
check("oversized body -> 413", big.status === 413);
const junk = await fetch(APP + "/api/analyze", { method: "POST", body: "not json" });
check("malformed JSON -> 400", junk.status === 400);

// Team counter rules (data/draft-rules.json has Gloo -> Vexana, Faramis). Open: jungler, mage.
const glooDraft = { bans: ["Hayabusa"], enemyPicks: ["Gloo", "Ling"], teamPicks: { roam: "Tigreal", marksman: "Miya", fighter: "Bane" } };
await setMode("good");
r = await post({ ...draft, enemyPicks: ["Ling", "Layla"] });
lc = await lastCall();
check("no rules block when no rule applies", !lc.last.body.messages[1].content.includes("COUNTER RULES") && r.json.rules.length === 0);

await setMode("follow_rules");
r = await post(glooDraft);
lc = await lastCall();
let u = lc.last.body.messages[1].content;
check("Gloo rule reaches the prompt", u.includes("OUR COACH'S COUNTER RULES") && u.includes("Enemy picked Gloo. Counter with: Vexana or Faramis."));
check("rule counters are on the candidate list with the reason", /- Vexana \(Mage[^\n]*our coach's counter to Gloo/.test(u));
check("rule followed -> no retry, counter offered as Mage", lc.calls === 1 && r.json.analysis.slots.some((s) => s.position === "mage" && s.options.some((o) => o.hero === "Vexana")), heroes(r));

await setMode("ignore_rules_then_good");
r = await post(glooDraft);
lc = await lastCall();
check("rule ignored -> one retry naming the rule", lc.calls === 2 && r.json.meta.retried === true && JSON.stringify(lc.last.body.messages).includes("counter rule says to offer Vexana or Faramis") && allOptions(r).some((h) => ["Vexana", "Faramis"].includes(h)), heroes(r));
check("still returns an answer after the retry", r.status === 200 && r.json.analysis.slots.length === 2);

await setMode("follow_rules");
r = await post({ ...glooDraft, bans: ["Vexana"] });
lc = await lastCall();
u = lc.last.body.messages[1].content;
check("banned counter is skipped", u.includes("Counter with: Faramis.") && !u.includes("Counter with: Vexana") && allOptions(r).includes("Faramis"), heroes(r));

await setMode("good");
r = await post({ ...glooDraft, teamPicks: { roam: "Tigreal", marksman: "Miya", mage: "Vexana" } });
lc = await lastCall();
check("team already has the counter -> no push, no retry", lc.calls === 1 && lc.last.body.messages[1].content.includes("Our team already has Vexana") && r.json.rules[0].teamHas === "Vexana");

await setMode("good");
r = await post({ ...glooDraft, teamPicks: { roam: "Tigreal", marksman: "Miya", mage: "Lylia" } });
lc = await lastCall();
check("counters that don't fit an open position are not pushed", lc.calls === 1 && r.json.rules[0].available.length === 0 && r.json.rules[0].offPosition.join() === "Vexana,Faramis");

await setMode("good");
r = await post({ ...glooDraft, bans: ["Vexana", "Faramis"] });
lc = await lastCall();
check("all counters gone -> no retry", lc.calls === 1 && r.status === 200);

// The team's saved screenshot draft (tests/drafts) through the mock.
const saved = JSON.parse(readFileSync(new URL("../tests/drafts/gloo-faramis-last-pick.json", import.meta.url), "utf8"));
await setMode("good");
r = await post(saved.draft);
lc = await lastCall();
u = lc.last.body.messages[1].content;
check("saved draft: only Roam is open", r.status === 200 && r.json.need === 1 && JSON.stringify(r.json.open) === '["roam"]' && u.includes("Open positions: Roam"));
check("saved draft: Gloo rule sees our Faramis, no retry", r.json.rules[0]?.teamHas === "Faramis" && lc.calls === 1 && u.includes("Our team already has Faramis"));
check("saved draft: 3 Roam options, none banned or picked", r.json.analysis.slots[0].position === "roam" && r.json.analysis.slots[0].options.length === 3 && !allOptions(r).some((h) => saved.expect.notPicked.includes(h)), heroes(r));
check("saved draft: prompt calls Nolan an Assassin", u.includes("Nolan (Assassin)") && !u.includes("Nolan (Tank"));

await setMode("wrong_position_then_good");
r = await post(saved.draft);
lc = await lastCall();
check("saved draft: Barats is not a Roam candidate and is rejected", lc.calls === 2 && JSON.stringify(lc.last.body.messages).includes("Barats is not on the candidate list for Roam") && !allOptions(r).includes("Barats"), heroes(r));

// A pro team to draft like (any team in data/meta.json).
const proTeam = JSON.parse(readFileSync(new URL("../data/meta.json", import.meta.url), "utf8")).teams?.[0];
if (proTeam) {
  await setMode("good");
  r = await post({ ...draft, team: proTeam.id });
  lc = await lastCall();
  const [s2, u2] = [lc.last.body.messages[0].content, lc.last.body.messages[1].content];
  check("chosen pro team reaches the prompt", s2.includes(`chose to draft like ${proTeam.name}`) && !s2.includes("One team's record is not a reason on its own"));
  check("candidates say how the chosen team did with each hero", u2.includes(`${proTeam.name} played it here`) || u2.includes(`${proTeam.name} has not played it here`));
  check("response names the chosen team", r.status === 200 && r.json.meta.pro.team?.id === proTeam.id && "logo" in r.json.meta.pro.team);
  r = await post({ ...draft, team: "xx-not-a-team" });
  check("unknown team id is ignored, not an error", r.status === 200 && r.json.meta.pro.team === null);
} else {
  check("data/meta.json lists pro teams", false);
}

// Rate limit: keep sending until the limiter answers.
let limited = 0;
for (let i = 0; i < 120 && limited === 0; i++) { const x = await post(draft); if (x.status === 429) limited++; }
check("rate limit kicks in", limited > 0, "429s=" + limited);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
