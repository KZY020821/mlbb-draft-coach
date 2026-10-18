import { db } from "./db";
import { getSettings, type Settings } from "./settings";
import { getPrice } from "./pricing";
import { isOwner, type User } from "./session";
import type { Usage } from "./deepseek";

// Who may run an analysis, in order: the owner, the free list, subscribers, then free trials.
export type AccessKind = "owner" | "comp" | "subscriber" | "trial" | "open";

export type Account = {
  email: string;
  name: string;
  image: string;
  plan: AccessKind | "free";
  trialLeft: number;
  trialTotal: number;
  periodEnd: string | null;
  priceSen: number;
};

const KL_DAY = `date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'`;
const KL_MONTH = `date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'`;

async function standing(user: User): Promise<{ plan: Account["plan"]; periodEnd: string | null }> {
  if (isOwner(user.email)) return { plan: "owner", periodEnd: null };
  const sql = await db();
  const [comp] = await sql`select 1 from comp_emails where email = ${user.email.toLowerCase()}`;
  if (comp) return { plan: "comp", periodEnd: null };
  const [sub] = await sql`select period_end from subscriptions
    where user_id = ${user.id} and status = 'active' and period_start <= now() and period_end > now()
    order by period_end desc limit 1`;
  if (sub) return { plan: "subscriber", periodEnd: new Date(sub.period_end).toISOString() };
  return { plan: "free", periodEnd: null };
}

export async function accountFor(user: User): Promise<Account> {
  const sql = await db();
  const [settings, s, price, fresh] = await Promise.all([
    getSettings(),
    standing(user),
    getPrice(),
    sql`select trial_used from users where id = ${user.id}`
  ]);
  const used = fresh[0]?.trial_used ?? user.trial_used;
  return {
    email: user.email,
    name: user.name,
    image: user.image,
    plan: s.plan,
    trialLeft: Math.max(0, settings.trialAnalyses - used),
    trialTotal: settings.trialAnalyses,
    periodEnd: s.periodEnd,
    priceSen: price.currentSen
  };
}

export type Gate =
  | { ok: true; access: AccessKind; settings: Settings }
  | { ok: false; status: number; code: string; message: string; extra?: Record<string, unknown> };

export async function monthSpendUsd(): Promise<number> {
  const sql = await db();
  const [row] = await sql.unsafe(`select coalesce(sum(cost_usd), 0)::float8 as usd from analyses where created_at >= ${KL_MONTH}`);
  return Number(row.usd);
}

// Decides access and, for a trial, reserves one use atomically (refund it if the analysis fails).
export async function gate(user: User): Promise<Gate> {
  const settings = await getSettings();
  const { plan } = await standing(user);
  if (plan === "owner") return { ok: true, access: "owner", settings };

  const paused = { ok: false as const, status: 503, code: "paused", message: "The AI coach is paused for maintenance. Try again later." };
  if (!settings.aiEnabled) return paused;
  if ((await monthSpendUsd()) >= settings.monthlyBudgetUsd) {
    console.error("[access] monthly AI budget reached");
    return paused;
  }

  const sql = await db();
  if (plan === "comp" || plan === "subscriber") {
    const [use] = await sql.unsafe(
      `select count(*) filter (where created_at >= ${KL_DAY})::int as day, count(*)::int as month
       from analyses where user_id = $1 and status = 'ok' and created_at >= ${KL_MONTH}`,
      [user.id]
    );
    if (use.day >= settings.dailyCap || use.month >= settings.monthlyCap) {
      return { ok: false, status: 429, code: "fair_use", message: "You have reached the fair-use limit. It resets tomorrow (or next month for the monthly limit)." };
    }
    return { ok: true, access: plan, settings };
  }

  const [reserved] = await sql`update users set trial_used = trial_used + 1
    where id = ${user.id} and trial_used < ${settings.trialAnalyses} returning trial_used`;
  if (reserved) return { ok: true, access: "trial", settings };

  const price = await getPrice();
  return {
    ok: false,
    status: 402,
    code: "subscribe",
    message: `You have used your ${settings.trialAnalyses} free analyses. The Coach plan is RM${(price.currentSen / 100).toFixed(2).replace(/\.00$/, "")} a month; subscriptions are opening soon.`,
    extra: { priceSen: price.currentSen }
  };
}

export async function refundTrial(user: User) {
  const sql = await db();
  await sql`update users set trial_used = greatest(trial_used - 1, 0) where id = ${user.id}`;
}

export function costUsd(u: Usage, s: Settings): number {
  const miss = Math.max(0, u.promptTokens - u.cacheHitTokens);
  return (miss * s.priceInputMissPerM + u.cacheHitTokens * s.priceInputHitPerM + u.completionTokens * s.priceOutputPerM) / 1e6;
}

export type LogEntry = {
  userId: number | null;
  status: "ok" | "error";
  access: AccessKind;
  model: string;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
  retried: boolean;
  errorCode?: string;
  draft: unknown;
  open: string[];
  result?: unknown;
};

// Never lets a logging problem break the visitor's answer.
export async function logAnalysis(e: LogEntry): Promise<number | null> {
  try {
    const sql = await db();
    const [row] = await sql`insert into analyses
      (user_id, status, access, model, prompt_tokens, cache_hit_tokens, completion_tokens, cost_usd, latency_ms, retried, error_code, draft, open_positions, result)
      values (${e.userId}, ${e.status}, ${e.access}, ${e.model}, ${e.usage.promptTokens}, ${e.usage.cacheHitTokens}, ${e.usage.completionTokens},
        ${e.costUsd}, ${e.latencyMs}, ${e.retried}, ${e.errorCode ?? ""}, ${sql.json(e.draft as never)}, ${e.open}, ${sql.json((e.result ?? {}) as never)})
      returning id`;
    return Number(row.id);
  } catch (err) {
    console.error("[access] could not log analysis", err);
    return null;
  }
}
