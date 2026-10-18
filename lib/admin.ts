import { db } from "./db";
import { getSettings } from "./settings";
import { getApiKey } from "./deepseek";
import { isOwner, ownerEmail } from "./session";

// Read-only reports for the admin page. All months and days are Malaysia time.
const TZ = "Asia/Kuala_Lumpur";

export type MonthRow = {
  month: string; // YYYY-MM
  revenueSen: number;
  feesSen: number;
  payments: number;
  aiUsd: number;
  analyses: number;
};

export async function profitByMonth(months = 6): Promise<{ rows: (MonthRow & { aiSen: number; fixedSen: number; profitSen: number })[]; usdToMyr: number; fixedMonthlyCostRm: number }> {
  const sql = await db();
  const s = await getSettings();
  const rows = await sql<{ month: string; live: boolean; revenue: number; fees: number; payments: number; ai: number; analyses: number }[]>`
    with m as (
      select to_char(generate_series(
        date_trunc('month', now() at time zone ${TZ}) - make_interval(months => ${months - 1}),
        date_trunc('month', now() at time zone ${TZ}), interval '1 month'), 'YYYY-MM') as month
    ),
    p as (
      select to_char(paid_at at time zone ${TZ}, 'YYYY-MM') as month, sum(amount_sen)::int as revenue, sum(fee_sen)::int as fees, count(*)::int as payments
      from payments group by 1
    ),
    a as (
      select to_char(created_at at time zone ${TZ}, 'YYYY-MM') as month, sum(cost_usd)::float8 as ai, count(*)::int as analyses
      from analyses group by 1
    )
    , first as (select to_char(min(created_at) at time zone ${TZ}, 'YYYY-MM') as month from users)
    select m.month, (first.month is not null and m.month >= first.month) as live, coalesce(p.revenue, 0) as revenue, coalesce(p.fees, 0) as fees, coalesce(p.payments, 0) as payments,
           coalesce(a.ai, 0) as ai, coalesce(a.analyses, 0) as analyses
    from m left join p using (month) left join a using (month) cross join first
    order by m.month desc`;
  // Fixed costs count from the month the first account signed up, not before launch.
  const fixedPerMonth = Math.round(s.fixedMonthlyCostRm * 100);
  return {
    usdToMyr: s.usdToMyr,
    fixedMonthlyCostRm: s.fixedMonthlyCostRm,
    rows: rows.map((r) => {
      const aiSen = Math.round(r.ai * s.usdToMyr * 100);
      const fixedSen = r.live ? fixedPerMonth : 0;
      return {
        month: r.month,
        revenueSen: r.revenue,
        feesSen: r.fees,
        payments: r.payments,
        aiUsd: r.ai,
        analyses: r.analyses,
        aiSen,
        fixedSen,
        profitSen: r.revenue - r.fees - aiSen - fixedSen
      };
    })
  };
}

export async function subscriberCounts() {
  const sql = await db();
  const [row] = await sql`
    select
      (select count(distinct user_id)::int from subscriptions where status = 'active' and period_start <= now() and period_end > now()) as active,
      (select count(distinct user_id)::int from subscriptions where status = 'active' and period_end > now() and period_end <= now() + interval '7 days') as renewing_soon,
      (select count(*)::int from users) as users,
      (select count(*)::int from users where created_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}) as new_users,
      (select count(*)::int from users where trial_used > 0) as tried,
      (select count(*)::int from comp_emails) as comp`;
  return row as { active: number; renewing_soon: number; users: number; new_users: number; tried: number; comp: number };
}

export type DayUsage = { day: string; analyses: number; ok: number; errors: number; promptTokens: number; cacheHitTokens: number; completionTokens: number; costUsd: number; avgMs: number; p95Ms: number; retried: number };

export async function usageByDay(days = 14): Promise<DayUsage[]> {
  const sql = await db();
  const rows = await sql`
    with d as (
      select to_char(generate_series(date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${days - 1}),
        date_trunc('day', now() at time zone ${TZ}), interval '1 day'), 'YYYY-MM-DD') as day
    ),
    a as (
      select to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
        count(*)::int as analyses,
        count(*) filter (where status = 'ok')::int as ok,
        count(*) filter (where status <> 'ok')::int as errors,
        sum(prompt_tokens)::int as pt, sum(cache_hit_tokens)::int as ch, sum(completion_tokens)::int as ct,
        sum(cost_usd)::float8 as cost,
        coalesce(avg(latency_ms) filter (where status = 'ok'), 0)::int as avg_ms,
        coalesce(percentile_cont(0.95) within group (order by latency_ms) filter (where status = 'ok'), 0)::int as p95_ms,
        count(*) filter (where retried)::int as retried
      from analyses where created_at >= now() - make_interval(days => ${days + 1}) group by 1
    )
    select d.day, coalesce(a.analyses, 0) as analyses, coalesce(a.ok, 0) as ok, coalesce(a.errors, 0) as errors,
      coalesce(a.pt, 0) as pt, coalesce(a.ch, 0) as ch, coalesce(a.ct, 0) as ct, coalesce(a.cost, 0) as cost,
      coalesce(a.avg_ms, 0) as avg_ms, coalesce(a.p95_ms, 0) as p95_ms, coalesce(a.retried, 0) as retried
    from d left join a using (day) order by d.day desc`;
  return rows.map((r) => ({
    day: r.day,
    analyses: r.analyses,
    ok: r.ok,
    errors: r.errors,
    promptTokens: r.pt,
    cacheHitTokens: r.ch,
    completionTokens: r.ct,
    costUsd: Number(r.cost),
    avgMs: r.avg_ms,
    p95Ms: r.p95_ms,
    retried: r.retried
  }));
}

export async function errorsThisMonth() {
  const sql = await db();
  return sql<{ code: string; n: number }[]>`
    select error_code as code, count(*)::int as n from analyses
    where status <> 'ok' and created_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}
    group by 1 order by 2 desc`;
}

export async function topSpenders(limit = 10) {
  const sql = await db();
  return sql<{ email: string; analyses: number; cost: number }[]>`
    select coalesce(u.email, '(not signed in)') as email, count(*)::int as analyses, sum(a.cost_usd)::float8 as cost
    from analyses a left join users u on u.id = a.user_id
    where a.created_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}
    group by 1 order by 3 desc nulls last limit ${limit}`;
}

// DeepSeek's account balance. Returns null when the key is missing or the call fails.
export async function deepseekBalance(): Promise<{ currency: string; total: string; granted: string; toppedUp: string }[] | null> {
  const key = getApiKey();
  if (!key) return null;
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/user/balance`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { balance_infos?: { currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }[] };
    return (body.balance_infos ?? []).map((b) => ({ currency: b.currency, total: b.total_balance, granted: b.granted_balance, toppedUp: b.topped_up_balance }));
  } catch {
    return null;
  }
}

export async function compEmails() {
  const sql = await db();
  return sql<{ email: string; note: string; added_at: Date; signed_up: boolean }[]>`
    select c.email, c.note, c.added_at, exists(select 1 from users u where u.email = c.email) as signed_up
    from comp_emails c order by c.added_at desc`;
}

export type UserRow = { id: number; email: string; name: string; created_at: Date; last_seen_at: Date; trial_used: number; analyses: number; picked: number; plan: string; period_end: Date | null; paid_sen: number };

export async function usersList(search = "", limit = 100): Promise<UserRow[]> {
  const sql = await db();
  const like = `%${search.toLowerCase().replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const rows = await sql`
    select u.id, u.email, u.name, u.created_at, u.last_seen_at, u.trial_used,
      (select count(*)::int from analyses a where a.user_id = u.id and a.status = 'ok') as analyses,
      (select count(*)::int from analyses a where a.user_id = u.id and a.picked_hero is not null) as picked,
      (select max(period_end) from subscriptions s where s.user_id = u.id and s.status = 'active' and s.period_end > now()) as period_end,
      exists(select 1 from comp_emails c where c.email = u.email) as comp,
      (select coalesce(sum(amount_sen), 0)::int from payments p where p.user_id = u.id) as paid_sen
    from users u
    where ${search ? sql`(lower(u.email) like ${like} or lower(u.name) like ${like})` : sql`true`}
    order by u.last_seen_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    name: r.name,
    created_at: r.created_at,
    last_seen_at: r.last_seen_at,
    trial_used: r.trial_used,
    analyses: r.analyses,
    picked: r.picked,
    period_end: r.period_end,
    paid_sen: r.paid_sen,
    plan: isOwner(r.email) ? "Owner" : r.comp ? "Free access" : r.period_end ? "Coach" : "Free"
  }));
}

export async function recentPayments(limit = 20) {
  const sql = await db();
  return sql<{ id: number; email: string; amount_sen: number; fee_sen: number; kind: string; provider: string; note: string; paid_at: Date }[]>`
    select id, email, amount_sen, fee_sen, kind, provider, note, paid_at from payments order by paid_at desc limit ${limit}`;
}

// Picks data from logged analyses, over the last N days.
export async function picksReport(days = 30) {
  const sql = await db();
  const since = sql`created_at >= now() - make_interval(days => ${days})`;
  const [totals] = await sql`
    select count(*)::int as ok, count(picked_hero)::int as picked,
      count(distinct user_id)::int as users
    from analyses where status = 'ok' and ${since}`;
  const suggested = await sql<{ position: string; hero: string; times: number; first: number; picked: number }[]>`
    select s->>'position' as position, o.value->>'hero' as hero, count(*)::int as times,
      count(*) filter (where o.ordinality = 1)::int as first,
      count(*) filter (where a.picked_hero = o.value->>'hero')::int as picked
    from analyses a, jsonb_array_elements(a.result->'slots') s, jsonb_array_elements(s->'options') with ordinality o
    where a.status = 'ok' and a.created_at >= now() - make_interval(days => ${days})
    group by 1, 2 order by 1, 3 desc`;
  const pickedRank = await sql<{ rank: number; n: number }[]>`
    select o.ordinality::int as rank, count(*)::int as n
    from analyses a, jsonb_array_elements(a.result->'slots') s, jsonb_array_elements(s->'options') with ordinality o
    where a.status = 'ok' and a.picked_hero = o.value->>'hero' and a.created_at >= now() - make_interval(days => ${days})
    group by 1 order by 1`;
  const enemies = await sql<{ hero: string; n: number }[]>`
    select h as hero, count(*)::int as n from analyses, jsonb_array_elements_text(draft->'enemy') h
    where status = 'ok' and ${since} group by 1 order by 2 desc limit 15`;
  const bans = await sql<{ hero: string; n: number }[]>`
    select h as hero, count(*)::int as n from analyses, jsonb_array_elements_text(draft->'bans') h
    where status = 'ok' and ${since} group by 1 order by 2 desc limit 15`;
  const open = await sql<{ position: string; n: number }[]>`
    select p as position, count(*)::int as n from analyses, unnest(open_positions) p
    where status = 'ok' and ${since} group by 1 order by 2 desc`;
  const recent = await sql<{ id: number; created_at: Date; email: string | null; open_positions: string[]; result: { slots?: { position: string; options: { hero: string }[] }[] }; picked_hero: string | null; draft: { enemy?: string[] } }[]>`
    select a.id, a.created_at, u.email, a.open_positions, a.result, a.picked_hero, a.draft
    from analyses a left join users u on u.id = a.user_id
    where a.status = 'ok' order by a.created_at desc limit 25`;
  return { days, totals: totals as { ok: number; picked: number; users: number }, suggested, pickedRank, enemies, bans, open, recent };
}

export const ownerAddress = ownerEmail;
