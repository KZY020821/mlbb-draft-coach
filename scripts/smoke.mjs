// End-to-end checks against a running app (default http://127.0.0.1:3100) and the mock.
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

const draft = {
  bans: ["Hayabusa", "Freya", "Atlas", "Fanny", "Selena"],
  enemyPicks: ["Ling", "Layla", "Gatotkaca", "Kagura", "Angela"],
  teamPicks: ["Tigreal", "Miya", "Bane"]
};

await setMode("good");
let r = await post(draft);
check("two picks left -> exactly 2 picks", r.status === 200 && r.json.analysis.picks.length === 2, JSON.stringify(r.json?.analysis?.picks?.map((p) => p.hero)));
check("backups returned", r.json.analysis.backups.length >= 1);
check("meta carries patch + model", r.json.meta.patch === "2.2.16" && r.json.meta.model === "deepseek-flash", JSON.stringify(r.json.meta));
let lc = await lastCall();
check("API key sent as bearer token", lc.last.auth === "Bearer test-key");
check("hits the chat completions path", lc.last.url === "/chat/completions");
check("JSON mode requested", lc.last.body.response_format?.type === "json_object");
check("DeepSeek thinking is turned off", lc.last.body.thinking?.type === "disabled" && !("reasoning_effort" in lc.last.body));
const sys = lc.last.body.messages[0].content, usr = lc.last.body.messages[1].content;
check("prompt includes patch + notes + roster", sys.includes("Patch 2.2.16") && sys.includes("Masha was reworked") && sys.includes("Hirara (Assassin)"));
check("prompt mentions JSON (required by JSON mode)", /json/i.test(sys));
check("prompt lists the draft", usr.includes("Enemy picks: Ling") && usr.includes("Our picks so far: Tigreal") && usr.includes("Banned heroes: Hayabusa"));
check("prompt asks for exactly 2", usr.includes("Recommend exactly 2"));

r = await post({ ...draft, teamPicks: ["Tigreal", "Miya", "Bane", "Khufra"] });
check("one pick left -> exactly 1 pick", r.status === 200 && r.json.analysis.picks.length === 1);

r = await post({ ...draft, teamPicks: ["Tigreal", "Miya"] });
check("three picks left -> still asks for 2", r.status === 200 && r.json.need === 2);

await setMode("bad_then_good");
r = await post(draft);
lc = await lastCall();
check("invented/banned heroes trigger one retry and recover", r.status === 200 && lc.calls === 2 && r.json.meta.retried === true && r.json.analysis.picks.length === 2, "calls=" + lc.calls);
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
  ["duplicate hero", { ...draft, bans: ["Hayabusa", "hayabusa"] }, "only once"],
  ["hero in bans and picks", { ...draft, teamPicks: ["Ling"] }, "only once"],
  ["team already full", { ...draft, teamPicks: ["Tigreal", "Miya", "Bane", "Khufra", "Grock"] }, "five picks"],
  ["too many bans", { ...draft, bans: Array(11).fill("Hayabusa") }, "at most 10"],
  ["empty draft", { bans: [], enemyPicks: [], teamPicks: [] }, "at least one"],
  ["wrong types", { bans: "Hayabusa" }, "list"]
];
for (const [name, body, frag] of bad) {
  r = await post(body);
  check("rejects: " + name, r.status === 400 && r.json.error.message.includes(frag), r.json?.error?.message);
}
r = await post({ ...draft, bans: ["popol and kupa", "POPOL & KUPA"] });
check("name matching is forgiving but still catches duplicates", r.status === 400 && r.json.error.message.includes("Popol & Kupa"));
r = await post({ ...draft, bans: ["  hayabusa  ", "FREYA"] });
check("whitespace and case are tolerated", r.status === 200);

const big = await fetch(APP + "/api/analyze", { method: "POST", body: "x".repeat(5000) });
check("oversized body -> 413", big.status === 413);
const junk = await fetch(APP + "/api/analyze", { method: "POST", body: "not json" });
check("malformed JSON -> 400", junk.status === 400);

// Rate limit: limit is set low by the test environment.
let limited = 0;
for (let i = 0; i < 80 && limited === 0; i++) { const x = await post(draft); if (x.status === 429) limited++; }
check("rate limit kicks in", limited > 0, "429s=" + limited);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
