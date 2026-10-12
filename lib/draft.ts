import type { Hero } from "./context";
import { resolveHero, type HeroIndex } from "./heroes";

export type Draft = {
  bans: Hero[];
  enemy: Hero[];
  team: Hero[];
};

export type ParsedRequest =
  | { ok: true; draft: Draft; need: number; deep: boolean }
  | { ok: false; message: string };

function names(value: unknown, max: number, label: string): { list: string[]; error?: string } {
  if (value === undefined || value === null) return { list: [] };
  if (!Array.isArray(value)) return { list: [], error: `${label} must be a list.` };
  if (value.length > max) return { list: [], error: `${label} can hold at most ${max} heroes.` };
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { list: [], error: `${label} must contain hero names only.` };
    const trimmed = item.trim();
    if (trimmed.length > 40) return { list: [], error: `${label} contains a name that is too long.` };
    if (trimmed) list.push(trimmed);
  }
  return { list };
}

export function parseRequest(body: unknown, index: HeroIndex): ParsedRequest {
  if (!body || typeof body !== "object") return { ok: false, message: "Send the draft as a JSON object." };
  const b = body as Record<string, unknown>;

  const groups = [
    { key: "bans", max: 10, label: "Bans" },
    { key: "enemyPicks", max: 5, label: "Enemy picks" },
    { key: "teamPicks", max: 5, label: "Team picks" }
  ] as const;

  const resolved: Record<string, Hero[]> = {};
  const unknown: string[] = [];
  for (const g of groups) {
    const { list, error } = names(b[g.key], g.max, g.label);
    if (error) return { ok: false, message: error };
    resolved[g.key] = [];
    for (const n of list) {
      const hero = resolveHero(index, n);
      if (hero) resolved[g.key].push(hero);
      else unknown.push(n);
    }
  }
  if (unknown.length) {
    return { ok: false, message: `These are not heroes in the roster: ${unknown.join(", ")}.` };
  }

  const all = [...resolved.bans, ...resolved.enemyPicks, ...resolved.teamPicks];
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const h of all) {
    if (seen.has(h.name)) dupes.add(h.name);
    seen.add(h.name);
  }
  if (dupes.size) {
    return { ok: false, message: `A hero can appear only once in a draft: ${[...dupes].join(", ")}.` };
  }

  const remaining = 5 - resolved.teamPicks.length;
  if (remaining < 1) return { ok: false, message: "Your team already has five picks." };
  if (all.length === 0) return { ok: false, message: "Enter at least one ban or pick." };

  return {
    ok: true,
    draft: { bans: resolved.bans, enemy: resolved.enemyPicks, team: resolved.teamPicks },
    need: Math.min(2, remaining),
    deep: b.deep === true
  };
}

export type Pick = { hero: string; role: string; why: string; risk: string };
export type Backup = { hero: string; why: string };
export type Analysis = {
  summary: string;
  confidence: "low" | "medium" | "high";
  picks: Pick[];
  backups: Backup[];
  plan: string;
};

export type Checked = {
  analysis: Analysis;
  problems: string[];
};

function text(v: unknown, max = 600): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Parse the model's JSON and keep only heroes that exist and are still available.
export function checkAnalysis(raw: string, index: HeroIndex, draft: Draft, need: number): Checked {
  const problems: string[] = [];
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
    else problems.push("The reply was not a JSON object.");
  } catch {
    problems.push("The reply was not valid JSON.");
  }

  const unavailable = new Set([...draft.bans, ...draft.enemy, ...draft.team].map((h) => h.name));
  const used = new Set<string>();

  function usable(name: unknown): Hero | undefined {
    const hero = resolveHero(index, name);
    if (!hero) {
      problems.push(`"${String(name)}" is not a hero in the roster.`);
      return undefined;
    }
    if (unavailable.has(hero.name)) {
      problems.push(`${hero.name} is already banned or picked.`);
      return undefined;
    }
    if (used.has(hero.name)) {
      problems.push(`${hero.name} was listed twice.`);
      return undefined;
    }
    used.add(hero.name);
    return hero;
  }

  const picks: Pick[] = [];
  for (const item of Array.isArray(data.picks) ? data.picks : []) {
    if (picks.length >= need) break;
    const rec = (item ?? {}) as Record<string, unknown>;
    const hero = usable(rec.hero);
    if (hero) picks.push({ hero: hero.name, role: text(rec.role, 40), why: text(rec.why), risk: text(rec.risk, 300) });
  }
  if (picks.length < need) problems.push(`Only ${picks.length} of ${need} requested picks were usable.`);

  const backups: Backup[] = [];
  for (const item of Array.isArray(data.backups) ? data.backups : []) {
    if (backups.length >= 3) break;
    const rec = (item ?? {}) as Record<string, unknown>;
    const hero = usable(rec.hero);
    if (hero) backups.push({ hero: hero.name, why: text(rec.why, 300) });
  }

  const conf = text(data.confidence, 10).toLowerCase();
  return {
    analysis: {
      summary: text(data.summary),
      confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : "medium",
      picks,
      backups,
      plan: text(data.plan)
    },
    problems
  };
}
