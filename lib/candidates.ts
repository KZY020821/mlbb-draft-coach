import type { Context, Hero } from "./context";
import { teamHeroes, type Draft } from "./draft";
import { getMeta, hasMeta, type Meta } from "./meta";
import { fitsPosition, type Position } from "./positions";
import type { AppliedRule } from "./rules";

// Why a hero made the shortlist. Shown in the results and given to the model as evidence.
export type Tag = "pro" | "focus" | "rule" | "pair" | "tier";

export type Candidate = {
  hero: string;
  roles: string[];
  tier: string;
  tags: Tag[];
  picks: number; // pro picks in this position
  wins: number;
  focusPicks: number; // the focus team's picks in this position
  focusWins: number;
  bans: number; // pro bans, any position
  pairs: { with: string; games: number; wins: number; focusGames: number }[]; // with our current picks
  evidence: string; // one line, plain words
};

const MAX_PER_POSITION = 12;

const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : "-");

function evidenceLine(c: Candidate, position: Position, meta: Meta, ruleEnemy?: string): string {
  const where = { roam: "roam", marksman: "gold lane", jungler: "jungle", mage: "mid lane", fighter: "EXP lane" }[position];
  const parts: string[] = [];
  if (c.picks) parts.push(`${c.picks} pro picks in ${where}, ${c.wins} wins (${pct(c.wins, c.picks)})`);
  else parts.push(`no pro picks in ${where} this season`);
  if (c.focusPicks) parts.push(`${meta.focusTeam}: ${c.focusWins}-${c.focusPicks - c.focusWins} in ${where}`);
  if (c.bans) parts.push(`banned ${c.bans} times`);
  for (const p of c.pairs.slice(0, 2)) parts.push(`with our ${p.with}: ${p.wins}-${p.games - p.wins}${p.focusGames ? ` (${p.focusGames} by ${meta.focusTeam})` : ""}`);
  if (ruleEnemy) parts.push(`our coach's counter to ${ruleEnemy}`);
  return parts.join("; ");
}

// Up to 12 heroes per open position, all available and played there, ranked by pro evidence.
export function buildCandidates(ctx: Context, draft: Draft, applied: AppliedRule[]): Record<Position, Candidate[]> {
  const meta = getMeta();
  const byName = new Map(ctx.heroes.map((h) => [h.name, h]));
  const taken = new Set([...draft.bans, ...draft.enemy, ...teamHeroes(draft)].map((h) => h.name));
  const ours = teamHeroes(draft).map((h) => h.name);
  const out = {} as Record<Position, Candidate[]>;

  for (const position of draft.open) {
    const picked = new Map<string, Candidate>();
    const ruleFor = new Map<string, string>();
    const usable = (name: string): Hero | undefined => {
      const h = byName.get(name);
      return h && !taken.has(h.name) && fitsPosition(h, position) ? h : undefined;
    };
    const add = (name: string, tag: Tag) => {
      const h = usable(name);
      if (!h) return;
      const existing = picked.get(h.name);
      if (existing) {
        if (!existing.tags.includes(tag)) existing.tags.push(tag);
        return;
      }
      if (picked.size >= MAX_PER_POSITION) return;
      const s = meta.heroes[h.name]?.positions?.[position];
      const pairs = meta.pairs
        .filter((p) => p.heroes.includes(h.name) && p.heroes.some((x) => ours.includes(x)))
        .map((p) => ({ with: p.heroes[0] === h.name ? p.heroes[1] : p.heroes[0], games: p.games, wins: p.wins, focusGames: p.focusGames }))
        .sort((a, b) => b.games - a.games);
      picked.set(h.name, {
        hero: h.name,
        roles: h.roles,
        tier: h.tier,
        tags: [tag],
        picks: s?.picks ?? 0,
        wins: s?.wins ?? 0,
        focusPicks: s?.focusPicks ?? 0,
        focusWins: s?.focusWins ?? 0,
        bans: meta.heroes[h.name]?.bans ?? 0,
        pairs,
        evidence: ""
      });
    };

    // 1. Our coach's counters always get a place.
    for (const r of applied) {
      if (r.teamHas) continue;
      for (const name of r.available) {
        if (usable(name)) ruleFor.set(name, r.enemy);
        add(name, "rule");
      }
    }
    if (hasMeta(meta)) {
      // 2. The focus team's own picks in this position.
      Object.entries(meta.heroes)
        .filter(([, m]) => (m.positions[position]?.focusPicks ?? 0) > 0)
        .sort((a, b) => (b[1].positions[position]!.focusPicks - a[1].positions[position]!.focusPicks) || (b[1].positions[position]!.weight - a[1].positions[position]!.weight))
        .slice(0, 3)
        .forEach(([name]) => add(name, "focus"));
      // 3. Heroes pros pair with our current picks.
      meta.pairs
        .filter((p) => p.heroes.some((x) => ours.includes(x)) && p.games >= 2)
        .map((p) => (ours.includes(p.heroes[0]) ? p.heroes[1] : p.heroes[0]))
        .filter((name) => (meta.heroes[name]?.positions?.[position]?.picks ?? 0) > 0)
        .slice(0, 3)
        .forEach((name) => add(name, "pair"));
      // 4. The most-played heroes in this position (recency and focus team weighted).
      for (const r of meta.ranking[position] ?? []) add(r.hero, "pro");
    }
    // 5. Too little pro data: fill with top-tier heroes for the position.
    if (picked.size < 6) {
      for (const tier of ["S", "A", "B"]) {
        for (const h of ctx.heroes.filter((x) => x.tier === tier)) {
          if (picked.size >= 8) break;
          add(h.name, "tier");
        }
      }
    }

    // Mark focus-team picks even when they arrived through another route.
    for (const c of picked.values()) if (c.focusPicks && !c.tags.includes("focus")) c.tags.push("focus");
    for (const c of picked.values()) c.evidence = evidenceLine(c, position, meta, ruleFor.get(c.hero));
    out[position] = [...picked.values()];
  }
  return out;
}
