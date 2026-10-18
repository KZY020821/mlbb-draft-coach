import { db } from "./db";

// Business settings the owner changes from the admin page. Stored as one JSON row.
export type Settings = {
  aiEnabled: boolean; // kill switch for all analyses except the owner's
  trialAnalyses: number; // free analyses per account
  dailyCap: number; // fair use per account per day (subscribers and free list)
  monthlyCap: number; // fair use per account per month
  monthlyBudgetUsd: number; // stop analyses (except the owner's) once AI spend reaches this
  usdToMyr: number;
  fixedMonthlyCostRm: number; // hosting, domain and other fixed costs, for profit
  priceInputMissPerM: number; // DeepSeek USD per 1M tokens
  priceInputHitPerM: number;
  priceOutputPerM: number;
};

export const DEFAULT_SETTINGS: Settings = {
  aiEnabled: true,
  trialAnalyses: 2,
  dailyCap: 100,
  monthlyCap: 1000,
  monthlyBudgetUsd: 20,
  usdToMyr: 4.08,
  fixedMonthlyCostRm: 87,
  priceInputMissPerM: 0.3,
  priceInputHitPerM: 0.006,
  priceOutputPerM: 1.2
};

const LIMITS: Record<keyof Settings, [number, number] | "bool"> = {
  aiEnabled: "bool",
  trialAnalyses: [0, 50],
  dailyCap: [1, 10000],
  monthlyCap: [1, 100000],
  monthlyBudgetUsd: [0, 100000],
  usdToMyr: [0.5, 50],
  fixedMonthlyCostRm: [0, 1000000],
  priceInputMissPerM: [0, 1000],
  priceInputHitPerM: [0, 1000],
  priceOutputPerM: [0, 1000]
};

export async function getSettings(): Promise<Settings> {
  const sql = await db();
  const rows = await sql`select value from settings where key = 'app'`;
  return { ...DEFAULT_SETTINGS, ...((rows[0]?.value as Partial<Settings>) ?? {}) };
}

// Validates and merges a partial update. Returns an error message for bad input.
export async function updateSettings(patch: Record<string, unknown>): Promise<{ ok: true; settings: Settings } | { ok: false; message: string }> {
  const current = await getSettings();
  const next: Settings = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in LIMITS)) return { ok: false, message: `Unknown setting: ${key}.` };
    const rule = LIMITS[key as keyof Settings];
    if (rule === "bool") {
      if (typeof value !== "boolean") return { ok: false, message: `${key} must be true or false.` };
      (next as Record<string, unknown>)[key] = value;
    } else {
      const n = Number(value);
      if (!Number.isFinite(n) || n < rule[0] || n > rule[1]) return { ok: false, message: `${key} must be between ${rule[0]} and ${rule[1]}.` };
      (next as Record<string, unknown>)[key] = ["trialAnalyses", "dailyCap", "monthlyCap"].includes(key) ? Math.round(n) : n;
    }
  }
  const sql = await db();
  await sql`insert into settings (key, value, updated_at) values ('app', ${sql.json(next)}, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return { ok: true, settings: next };
}
