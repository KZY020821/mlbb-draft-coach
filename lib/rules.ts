import raw from "@/data/draft-rules.json";
import type { Draft } from "./draft";
import { resolveHero, type HeroIndex } from "./heroes";
import { fitsPosition } from "./positions";

// The team's own draft knowledge, edited in data/draft-rules.json.
export type CounterRule = { enemy: string; picks: string[]; why?: string };
export type Rules = { counters: CounterRule[]; principles: string[] };

export type AppliedRule = {
  enemy: string;
  available: string[]; // counters still open that fit one of our open positions
  unavailable: string[]; // counters that are banned or already picked
  offPosition: string[]; // counters still open but not played in any of our open positions
  why: string;
  teamHas: string | null; // a counter our team already picked
};

export function getRules(): Rules {
  const r = raw as unknown as Partial<Rules>;
  return {
    counters: Array.isArray(r.counters) ? r.counters : [],
    principles: Array.isArray(r.principles) ? r.principles.filter((p) => typeof p === "string" && p.trim()) : []
  };
}

// Counter rules whose enemy hero is in the enemy's picks.
export function applyRules(rules: Rules, index: HeroIndex, draft: Draft): AppliedRule[] {
  const enemy = new Set(draft.enemy.map((h) => h.name));
  const ours = new Set(draft.team.map((t) => t.hero.name));
  const taken = new Set([...draft.bans, ...draft.enemy, ...draft.team.map((t) => t.hero)].map((h) => h.name));
  const byEnemy = new Map<string, AppliedRule>();

  for (const rule of rules.counters) {
    const target = resolveHero(index, rule.enemy);
    if (!target || !enemy.has(target.name)) continue;
    const entry =
      byEnemy.get(target.name) ?? { enemy: target.name, available: [], unavailable: [], offPosition: [], why: "", teamHas: null };
    for (const name of Array.isArray(rule.picks) ? rule.picks : []) {
      const hero = resolveHero(index, name);
      if (!hero || [...entry.available, ...entry.unavailable, ...entry.offPosition].includes(hero.name)) continue;
      if (ours.has(hero.name)) entry.teamHas = entry.teamHas ?? hero.name;
      if (taken.has(hero.name)) entry.unavailable.push(hero.name);
      else if (draft.open.some((p) => fitsPosition(hero, p))) entry.available.push(hero.name);
      else entry.offPosition.push(hero.name);
    }
    if (typeof rule.why === "string" && rule.why.trim()) {
      entry.why = entry.why ? `${entry.why} ${rule.why.trim()}` : rule.why.trim();
    }
    byEnemy.set(target.name, entry);
  }
  return [...byEnemy.values()];
}

// Names in the rules file that are not in the roster, so typos are easy to spot.
export function unknownRuleNames(rules: Rules, index: HeroIndex): string[] {
  const names = rules.counters.flatMap((r) => [r.enemy, ...(Array.isArray(r.picks) ? r.picks : [])]);
  return [...new Set(names.filter((n) => !resolveHero(index, n)))];
}
