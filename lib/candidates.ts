import type { Context, Hero } from "./context";
import { teamHeroes, type Draft } from "./draft";
import { getMeta, hasMeta, type Team } from "./meta";
import { fitsPosition, type Position } from "./positions";
import type { AppliedRule } from "./rules";
import scoringRaw from "@/data/scoring.json";

// Why a hero made the shortlist. Shown in the results and given to the model as evidence.
// "team": the pro team the player chose plays this hero in this position.
export type Tag = "pro" | "team" | "rule" | "pair" | "counter" | "tier";

export type Candidate = {
  hero: string;
  roles: string[];
  tier: string;
  tags: Tag[];
  score: number; // 0-100, see data/scoring.json
  picks: number; // pro picks in this position
  wins: number;
  teamPicks: number; // the chosen pro team's picks in this position
  teamWins: number;
  bans: number; // pro bans, any position
  pairs: { with: string; games: number; wins: number }[]; // with our current picks
  versus: { enemy: string; games: number; wins: number }[]; // pro games against the enemy's current picks
  evidence: string; // one line, plain words
};

type Scoring = {
  weights: { popularity: number; winRate: number; counter: number; synergy: number };
  team: { weight: number; popularity: number };
  minCounterGames: number;
};
export const SCORING = scoringRaw as unknown as Scoring;

const MAX_PER_POSITION = 12;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : "-");

// A win rate pulled towards 50% by `prior` imaginary games, so 2-0 doesn't look like 100%.
const smoothed = (wins: number, games: number, prior: number) => (wins + prior / 2) / (games + prior);

// Spreads a smoothed win rate onto 0-1: 35% or worse is 0, 65% or better is 1, 50% is 0.5.
const rate01 = (r: number) => clamp01((r - 0.35) / 0.3);

function evidenceLine(c: Candidate, position: Position, team: Team | null, ruleEnemy?: string): string {
  const where = { roam: "roam", marksman: "gold lane", jungler: "jungle", mage: "mid lane", fighter: "EXP lane" }[position];
  const parts: string[] = [];
  if (c.picks) parts.push(`${c.picks} pro picks in ${where}, ${c.wins} wins (${pct(c.wins, c.picks)})`);
  else parts.push(`no pro picks in ${where} this season`);
  const vs = c.versus.filter((v) => v.games >= 2).slice(0, 3);
  if (vs.length) parts.push(`against the enemy's current picks: ${vs.map((v) => `vs ${v.enemy} ${v.wins}-${v.games - v.wins}`).join(", ")}`);
  for (const p of c.pairs.slice(0, 2)) parts.push(`with our ${p.with}: ${p.wins}-${p.games - p.wins}`);
  if (c.bans) parts.push(`banned ${c.bans} times`);
  if (team) {
    parts.push(
      c.teamPicks
        ? `${team.name} played it here ${c.teamPicks} time${c.teamPicks === 1 ? "" : "s"}, ${c.teamWins}-${c.teamPicks - c.teamWins}`
        : `${team.name} has not played it here`
    );
  }
  if (ruleEnemy) parts.push(`our coach's counter to ${ruleEnemy}`);
  return parts.join("; ");
}

// Up to 12 heroes per open position, all available and played there, ranked by one score:
// how much pros play them there, how they do, how they did against the enemy's picks and with ours,
// and, when the player chose a pro team to draft like, how much that team plays them there.
export function buildCandidates(ctx: Context, draft: Draft, applied: AppliedRule[], team: Team | null = null): Record<Position, Candidate[]> {
  const meta = getMeta();
  const byName = new Map(ctx.heroes.map((h) => [h.name, h]));
  const taken = new Set([...draft.bans, ...draft.enemy, ...teamHeroes(draft)].map((h) => h.name));
  const ours = teamHeroes(draft).map((h) => h.name);
  const enemy = draft.enemy.map((h) => h.name);
  const w = SCORING.weights;
  const out = {} as Record<Position, Candidate[]>;

  for (const position of draft.open) {
    const usable = (name: string): Hero | undefined => {
      const h = byName.get(name);
      return h && !taken.has(h.name) && fitsPosition(h, position) ? h : undefined;
    };
    const ruleFor = new Map<string, string>();
    for (const r of applied) {
      if (r.teamHas) continue;
      for (const name of r.available) if (usable(name)) ruleFor.set(name, r.enemy);
    }

    // Everyone who could play here: pro picks in this position, our coach's counters, and the tier list as a fallback.
    const pool = new Set<string>();
    if (hasMeta(meta)) for (const [name, m] of Object.entries(meta.heroes)) if (m.positions[position]?.picks) pool.add(name);
    for (const name of ruleFor.keys()) pool.add(name);
    const maxWeight = Math.max(1e-9, ...Object.values(meta.heroes).map((m) => m.positions[position]?.weight ?? 0));
    const teamMax = team ? Math.max(1e-9, ...Object.values(team.heroes).map((byPos) => byPos[position]?.[2] ?? 0)) : 1;

    const scored: Candidate[] = [];
    const score = (name: string, fallback = false) => {
      const h = usable(name);
      if (!h) return;
      const s = meta.heroes[h.name]?.positions?.[position];
      const picks = s?.picks ?? 0;
      const wins = s?.wins ?? 0;

      const pairs = meta.pairs
        .filter((p) => p.heroes.includes(h.name) && p.heroes.some((x) => ours.includes(x)))
        .map((p) => ({ with: p.heroes[0] === h.name ? p.heroes[1] : p.heroes[0], games: p.games, wins: p.wins }))
        .sort((a, b) => b.games - a.games);
      const row = meta.matchups?.[h.name] ?? {};
      const versus = enemy
        .map((e) => ({ enemy: e, games: row[e]?.[0] ?? 0, wins: row[e]?.[1] ?? 0 }))
        .filter((v) => v.games > 0)
        .sort((a, b) => b.games - a.games);

      const vsGames = versus.reduce((n, v) => n + v.games, 0);
      const vsWins = versus.reduce((n, v) => n + v.wins, 0);
      const pairGames = pairs.reduce((n, p) => n + p.games, 0);
      const pairWins = pairs.reduce((n, p) => n + p.wins, 0);

      const popularity = clamp01((s?.weight ?? 0) / maxWeight);
      const winRate = rate01(smoothed(wins, picks, 6));
      const counter = vsGames >= SCORING.minCounterGames ? rate01(smoothed(vsWins, vsGames, 8)) : 0.5;
      const synergy = pairGames >= 2 ? rate01(smoothed(pairWins, pairGames, 6)) : 0.5;
      const base = w.popularity * popularity + w.winRate * winRate + w.counter * counter + w.synergy * synergy;

      // The chosen team's part: how often it plays the hero here (against its most played), and how it did.
      const [teamPicks, teamWins, teamWeight] = team?.heroes[h.name]?.[position] ?? [0, 0, 0];
      const tw = team ? SCORING.team.weight : 0;
      const teamPart = teamPicks
        ? SCORING.team.popularity * clamp01(teamWeight / teamMax) + (1 - SCORING.team.popularity) * rate01(smoothed(teamWins, teamPicks, 4))
        : 0;
      const total = ((1 - tw) * base + tw * teamPart) * 100;

      const tags: Tag[] = [];
      if (ruleFor.has(h.name)) tags.push("rule");
      if (picks) tags.push("pro");
      if (vsGames >= SCORING.minCounterGames && counter >= 0.6) tags.push("counter");
      if (pairGames >= 2 && synergy >= 0.6) tags.push("pair");
      if (teamPicks >= 2) tags.push("team");
      if (fallback) tags.push("tier");

      scored.push({
        hero: h.name,
        roles: h.roles,
        tier: h.tier,
        tags,
        score: Math.round(total),
        picks,
        wins,
        teamPicks,
        teamWins,
        bans: meta.heroes[h.name]?.bans ?? 0,
        pairs,
        versus,
        evidence: ""
      });
    };
    for (const name of pool) score(name);

    // Too little pro data: fill with top-tier heroes for the position.
    if (scored.length < 6) {
      const have = new Set(scored.map((c) => c.hero));
      for (const tier of ["S", "A", "B"]) {
        for (const h of ctx.heroes.filter((x) => x.tier === tier && !have.has(x.name))) {
          if (scored.length >= 8) break;
          score(h.name, true);
        }
      }
    }

    // Our coach's counters always get a place and are listed first; the rest is best score first.
    scored.sort((a, b) => b.score - a.score || b.picks - a.picks);
    const rules = scored.filter((c) => c.tags.includes("rule"));
    const rest = scored.filter((c) => !c.tags.includes("rule")).slice(0, Math.max(0, MAX_PER_POSITION - rules.length));
    const list = [...rules, ...rest];
    for (const c of list) c.evidence = evidenceLine(c, position, team, ruleFor.get(c.hero));
    out[position] = list;
  }
  return out;
}
