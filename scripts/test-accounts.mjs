// Tests Google sign-in, free trials, the paywall, free emails, owner access, logging and picks.
// Needs: a Postgres (DATABASE_URL), scripts/mock-google.mjs, scripts/mock-deepseek.mjs and the app
// started with accounts on (see README "Tests"). Usage: APP_URL=http://127.0.0.1:3200 node scripts/test-accounts.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const APP = process.env.APP_URL || "http://127.0.0.1:3200";
const GOOGLE = "http://127.0.0.1:4020";
const DEEPSEEK = "http://127.0.0.1:4010";
const OWNER = process.env.OWNER_EMAIL || "owner@example.com";
const sql = postgres(process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5544/postgres", { max: 1, prepare: false });

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
  if (!ok) failed++;
};

const cookiesFrom = (res) =>
  Object.fromEntries(res.headers.getSetCookie().map((c) => c.split(";")[0]).map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]));
const cookieHeader = (jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");

async function signIn(email, { verified = true, tamperState = false } = {}) {
  await fetch(`${GOOGLE}/__user`, { method: "POST", body: JSON.stringify({ email, sub: `sub-${email}`, verified }) });
  const start = await fetch(`${APP}/api/auth/google?next=/`, { redirect: "manual" });
  const jar = cookiesFrom(start);
  const auth = await fetch(start.headers.get("location"), { redirect: "manual" });
  let cb = auth.headers.get("location");
  if (tamperState) cb = cb.replace(/state=[^&]+/, "state=wrong");
  const done = await fetch(cb, { redirect: "manual", headers: { cookie: cookieHeader(jar) } });
  return { location: done.headers.get("location"), session: cookiesFrom(done).dc_session, startLocation: start.headers.get("location") };
}

const draft = JSON.parse(readFileSync(new URL("../tests/drafts/gloo-faramis-last-pick.json", import.meta.url))).draft;
const body = JSON.stringify({ bans: draft.bans, enemyPicks: draft.enemyPicks, teamPicks: draft.teamPicks });
const analyze = (session) =>
  fetch(`${APP}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json", ...(session ? { cookie: `dc_session=${session}` } : {}) }, body }).then(async (r) => ({
    status: r.status,
    data: await r.json().catch(() => null)
  }));
const mode = (m) => fetch(`${DEEPSEEK}/__mode`, { method: "POST", body: JSON.stringify({ mode: m }) });
const page = (path, session) => fetch(`${APP}${path}`, { redirect: "manual", headers: session ? { cookie: `dc_session=${session}` } : {} });

// Clean slate for the accounts used here.
await signIn("warmup@example.com"); // creates the schema on first use
await sql`delete from analyses`;
await sql`delete from payments`;
await sql`delete from subscriptions`;
await sql`delete from comp_emails`;
await sql`delete from users`;
await sql`delete from prices`;
await sql`delete from settings`;
await mode("good");

// --- Sign-in ---
const start = await fetch(`${APP}/api/auth/google`, { redirect: "manual" });
const startUrl = new URL(start.headers.get("location"));
check("sign-in redirects to Google with PKCE and state", startUrl.origin === GOOGLE && startUrl.searchParams.get("code_challenge_method") === "S256" && startUrl.searchParams.get("redirect_uri") === `${APP}/api/auth/callback/google`);
const startCookie = start.headers.getSetCookie().join(";");
check("handshake cookie is httpOnly and SameSite=Lax", /HttpOnly/i.test(startCookie) && /SameSite=lax/i.test(startCookie));

const p1 = await signIn("player1@example.com");
check("callback sets a session and returns home", Boolean(p1.session) && p1.location === `${APP}/`, p1.location);
const bad = await signIn("player9@example.com", { tamperState: true });
check("wrong state is refused", !bad.session && /auth=expired/.test(bad.location ?? ""), bad.location);
const unv = await signIn("player8@example.com", { verified: false });
check("unverified Google email is refused", !unv.session && /auth=unverified/.test(unv.location ?? ""), unv.location);
const replay = await fetch(`${APP}/api/auth/callback/google?code=abc&state=xyz`, { redirect: "manual" });
check("callback without the handshake cookie is refused", /auth=expired/.test(replay.headers.get("location") ?? ""));

const home = await (await page("/", p1.session)).text();
check("home shows the signed-in account and free count", home.includes("player1@example.com") && home.includes("Sign out"));
const homeAnon = await (await page("/")).text();
check("home shows Sign in with Google when signed out", homeAnon.includes("Sign in with Google"));

// --- Access ---
let r = await analyze(null);
check("analysis needs sign-in", r.status === 401 && r.data?.error?.code === "sign_in");
r = await analyze(p1.session.slice(0, -2) + "xx");
check("tampered session is refused", r.status === 401);

r = await analyze(p1.session);
check("free analysis 1 works", r.status === 200 && r.data.account?.trialLeft === 1 && r.data.analysisId > 0, `left=${r.data?.account?.trialLeft}`);
const firstId = r.data.analysisId;
const firstHero = r.data.analysis.slots[0].options[1].hero;

await mode("429");
r = await analyze(p1.session);
check("a failed analysis does not use a free analysis", r.status === 503);
let [u1] = await sql`select trial_used from users where email = 'player1@example.com'`;
check("trial refunded after failure", u1.trial_used === 1, `trial_used=${u1.trial_used}`);
await mode("good");

r = await analyze(p1.session);
check("free analysis 2 works", r.status === 200 && r.data.account?.trialLeft === 0);
r = await analyze(p1.session);
check("third analysis hits the paywall with the price", r.status === 402 && r.data?.error?.code === "subscribe" && r.data.error.priceSen === 1500, r.data?.error?.message);

// Parallel requests can't overspend the trial.
const p2 = await signIn("player2@example.com");
const burst = await Promise.all(Array.from({ length: 5 }, () => analyze(p2.session)));
check("5 parallel requests use only 2 free analyses", burst.filter((x) => x.status === 200).length === 2 && burst.filter((x) => x.status === 402).length === 3, burst.map((x) => x.status).join(","));

// --- Logging ---
const [row] = await sql`select * from analyses where id = ${firstId}`;
check("analysis logged with tokens and cost", row.prompt_tokens === 3000 && row.cache_hit_tokens === 1000 && row.completion_tokens === 400 && Number(row.cost_usd) > 0, `cost=${row.cost_usd}`);
check("draft logged with hero names", row.draft.enemy.includes("Gloo") && row.draft.team.mage === "Faramis" && row.open_positions.join() === "roam");
const [errRow] = await sql`select count(*)::int as n from analyses where status = 'error' and error_code = 'busy'`;
check("failed analysis logged", errRow.n === 1);

// --- Picked ---
const pick = (session, id, hero) =>
  fetch(`${APP}/api/picked`, { method: "POST", headers: { "Content-Type": "application/json", cookie: `dc_session=${session}` }, body: JSON.stringify({ analysisId: id, hero }) });
check("player can mark a suggested hero as picked", (await pick(p1.session, firstId, firstHero)).status === 200);
check("a hero that was not suggested is refused", (await pick(p1.session, firstId, "Layla")).status === 404);
check("another account cannot mark it", (await pick(p2.session, firstId, firstHero)).status === 404);
const [pk] = await sql`select picked_hero from analyses where id = ${firstId}`;
check("picked hero saved", pk.picked_hero === firstHero, pk.picked_hero);

// --- Owner and admin ---
const owner = await signIn(OWNER);
check("non-owner gets 404 on /admin", (await page("/admin", p1.session)).status === 404);
const anonAdmin = await page("/admin");
check("signed-out /admin goes to sign-in", [307, 308].includes(anonAdmin.status) && /api\/auth\/google\?next=%2Fadmin|next=\/admin/.test(anonAdmin.headers.get("location") ?? ""), anonAdmin.headers.get("location"));
for (let i = 0; i < 4; i++) r = await analyze(owner.session);
check("owner is never limited", r.status === 200 && r.data.account?.plan === "owner");
const adminHtml = await (await page("/admin", owner.session)).text();
check("owner sees the admin page", adminHtml.includes("Admin") && adminHtml.includes("Profit"));
for (const tab of ["pricing", "usage", "free", "users", "picks"]) {
  const res = await page(`/admin?tab=${tab}`, owner.session);
  check(`admin tab ${tab} renders`, res.status === 200);
}
const usageHtml = await (await page("/admin?tab=usage", owner.session)).text();
check("admin shows the DeepSeek balance", usageHtml.includes("9.87 USD"));
const picksHtml = await (await page("/admin?tab=picks", owner.session)).text();
check("admin picks data shows the marked pick", picksHtml.includes(firstHero) && picksHtml.includes("Gloo"));

// --- Free list, subscription, kill switch, budget (set directly; the UI is tested in test-admin-ui) ---
await sql`insert into comp_emails (email, note) values ('player1@example.com', 'tester')`;
r = await analyze(p1.session);
check("free-list email can analyze after its trial", r.status === 200 && r.data.account?.plan === "comp");

await sql`insert into subscriptions (user_id, status, price_sen, period_start, period_end)
          select id, 'active', 1500, now() - interval '1 day', now() + interval '29 days' from users where email = 'player2@example.com'`;
r = await analyze(p2.session);
check("subscriber can analyze", r.status === 200 && r.data.account?.plan === "subscriber");

await sql`insert into settings (key, value) values ('app', '{"aiEnabled": false}') on conflict (key) do update set value = excluded.value`;
r = await analyze(p2.session);
check("kill switch pauses everyone else", r.status === 503 && r.data?.error?.code === "paused");
r = await analyze(owner.session);
check("kill switch does not stop the owner", r.status === 200);

await sql`update settings set value = '{"aiEnabled": true, "monthlyBudgetUsd": 0.0001}' where key = 'app'`;
r = await analyze(p2.session);
check("monthly budget pauses analyses", r.status === 503 && r.data?.error?.code === "paused");
await sql`update settings set value = '{"dailyCap": 1}' where key = 'app'`;
r = await analyze(p2.session);
check("daily fair-use limit applies to subscribers", r.status === 429 && r.data?.error?.code === "fair_use");
await sql`delete from settings`;

// --- Sign out ---
const out = await fetch(`${APP}/api/auth/logout`, { method: "POST", redirect: "manual", headers: { cookie: `dc_session=${p1.session}` } });
check("sign-out clears the session cookie", /dc_session=;/.test(out.headers.getSetCookie().join(";")));
check("sign-out needs POST", (await fetch(`${APP}/api/auth/logout`, { redirect: "manual" })).status === 405);

await sql.end();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll account checks passed");
process.exit(failed ? 1 : 0);
