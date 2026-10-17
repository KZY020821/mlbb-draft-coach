// Turns parsed pro games into the meta stats the app reads (data/meta.json).
// Pure functions with no Node or browser APIs.
//
// Liquipedia lists each team's five picks but not who played which position, so positions are
// inferred: every lineup must fill all five positions once, and a hero's likely positions are
// learned across all lineups (soft EM), starting from its roles and known lanes.

import { HERO_ALIASES, idOf } from "./parse.mjs";

export const POSITIONS = ["roam", "marksman", "jungler", "mage", "fighter"];
const LANE = { roam: "Roam", marksman: "Gold", jungler: "Jungle", mage: "Mid", fighter: "EXP" };
const ROLE_FIT = {
  roam: ["Tank", "Support"],
  marksman: ["Marksman"],
  jungler: ["Assassin", "Fighter", "Tank"],
  mage: ["Mage"],
  fighter: ["Fighter", "Tank"]
};

function prior(hero, p) {
  const roleFit = hero.roles.some((r) => ROLE_FIT[p].includes(r));
  if (hero.lanes && hero.lanes.length) {
    if (hero.lanes.includes(LANE[p])) return 1;
    return roleFit ? 0.3 : 0.04;
  }
  return roleFit ? 1 : 0.06;
}

// All 120 ways to give 5 heroes the 5 positions.
const PERMS = (() => {
  const out = [];
  const go = (rest, acc) => {
    if (!rest.length) return out.push(acc);
    rest.forEach((x, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  };
  go([0, 1, 2, 3, 4], []);
  return out;
})();

function dayDiff(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function buildMeta(games, roster, opts = {}) {
  const focusTeam = opts.focusTeam ?? "Team Liquid PH";
  const focusWeight = opts.focusWeight ?? 3;
  const halfLifeDays = opts.halfLifeDays ?? 28;

  const byId = new Map(roster.map((h) => [idOf(h.name), h]));
  const unknown = new Set();
  const resolve = (raw) => {
    const id = idOf(raw);
    const hero = byId.get(id) ?? (HERO_ALIASES[id] ? byId.get(idOf(HERO_ALIASES[id])) : undefined);
    if (!hero) unknown.add(raw);
    return hero ? hero.name : null;
  };

  // Lineups: one per team per game.
  const lineups = [];
  const bansByHero = {};
  for (const g of games) {
    for (const t of [0, 1]) {
      const heroes = g.picks[t].map(resolve);
      for (const b of g.bans[t] || []) {
        const name = resolve(b);
        if (name) bansByHero[name] = (bansByHero[name] || 0) + 1;
      }
      if (heroes.some((h) => !h)) continue;
      lineups.push({ game: g, team: g.teams[t], opponent: g.teams[1 - t], won: g.winner === t, heroes });
    }
  }
  const latest = games.reduce((d, g) => (g.date > d ? g.date : d), "");

  // Soft EM over position assignments.
  const heroByName = new Map(roster.map((h) => [h.name, h]));
  const priorOf = {};
  const P = {};
  for (const l of lineups) {
    for (const h of l.heroes) {
      if (P[h]) continue;
      const raw = POSITIONS.map((p) => prior(heroByName.get(h), p));
      const sum = raw.reduce((a, b) => a + b, 0);
      priorOf[h] = raw.map((x) => x / sum);
      P[h] = [...priorOf[h]];
    }
  }
  const alpha = 2;
  let posterior = [];
  for (let iter = 0; iter < 25; iter++) {
    const counts = {};
    posterior = lineups.map((l) => {
      const scores = PERMS.map((perm) => l.heroes.reduce((s, h, i) => s * P[h][perm[i]], 1));
      const total = scores.reduce((a, b) => a + b, 0) || 1;
      const weights = scores.map((s) => s / total);
      weights.forEach((w, k) => {
        if (!w) return;
        PERMS[k].forEach((pi, i) => {
          const h = l.heroes[i];
          (counts[h] ||= [0, 0, 0, 0, 0])[pi] += w;
        });
      });
      return weights;
    });
    for (const h of Object.keys(P)) {
      const c = counts[h] || [0, 0, 0, 0, 0];
      const n = c.reduce((a, b) => a + b, 0);
      P[h] = c.map((x, i) => (x + alpha * priorOf[h][i]) / (n + alpha));
    }
  }

  // Hand corrections (data/position-overrides.json): { date, team, positions: { roam, marksman, ... } }.
  const overrides = (opts.overrides ?? []).map((o) => ({
    ...o,
    team: o.team,
    positions: Object.fromEntries(Object.entries(o.positions || {}).map(([p, h]) => [p, resolve(h)]))
  }));
  const sameHeroes = (a, b) => [...a].sort().join("|") === [...b].sort().join("|");

  // Hard assignment per lineup, with how sure the inference is.
  const assigned = lineups.map((l, idx) => {
    const fix = overrides.find(
      (o) => o.date === l.game.date && o.team === l.team && POSITIONS.every((p) => o.positions[p]) && sameHeroes(Object.values(o.positions), l.heroes)
    );
    if (fix) return { ...l, positions: fix.positions, confidence: 1, corrected: true };
    const w = posterior[idx];
    let best = 0;
    for (let k = 1; k < w.length; k++) if (w[k] > w[best]) best = k;
    const positions = {};
    PERMS[best].forEach((pi, i) => (positions[POSITIONS[pi]] = l.heroes[i]));
    return { ...l, positions, confidence: Math.round(w[best] * 100) / 100 };
  });

  // Stats per hero and position.
  const stats = {};
  const pairs = {};
  for (const l of assigned) {
    const focus = l.team === focusTeam;
    const recency = Math.pow(0.5, dayDiff(l.game.date, latest) / halfLifeDays);
    const weight = recency * (focus ? focusWeight : 1);
    for (const p of POSITIONS) {
      const h = l.positions[p];
      const s = (((stats[h] ||= {})[p]) ||= { picks: 0, wins: 0, focusPicks: 0, focusWins: 0, weight: 0, lastPlayed: "" });
      s.picks++;
      s.wins += l.won ? 1 : 0;
      if (focus) {
        s.focusPicks++;
        s.focusWins += l.won ? 1 : 0;
      }
      s.weight += weight;
      if (l.game.date > s.lastPlayed) s.lastPlayed = l.game.date;
    }
    const hs = [...l.heroes].sort();
    for (let i = 0; i < hs.length; i++) {
      for (let j = i + 1; j < hs.length; j++) {
        const key = hs[i] + "|" + hs[j];
        const pr = (pairs[key] ||= { heroes: [hs[i], hs[j]], games: 0, wins: 0, focusGames: 0, focusWins: 0, weight: 0 });
        pr.games++;
        pr.wins += l.won ? 1 : 0;
        if (focus) {
          pr.focusGames++;
          pr.focusWins += l.won ? 1 : 0;
        }
        pr.weight += weight;
      }
    }
  }

  const round = (x) => Math.round(x * 100) / 100;
  const heroes = {};
  for (const [h, byPos] of Object.entries(stats)) {
    let picks = 0;
    let wins = 0;
    for (const s of Object.values(byPos)) {
      picks += s.picks;
      wins += s.wins;
      s.weight = round(s.weight);
    }
    heroes[h] = { picks, wins, bans: bansByHero[h] || 0, positions: byPos };
  }
  for (const [h, bans] of Object.entries(bansByHero)) heroes[h] ||= { picks: 0, wins: 0, bans, positions: {} };

  // Ranking per position: recency- and focus-weighted picks, nudged by a smoothed win rate.
  const ranking = {};
  for (const p of POSITIONS) {
    ranking[p] = Object.entries(stats)
      .filter(([, byPos]) => byPos[p])
      .map(([h, byPos]) => {
        const s = byPos[p];
        const winRate = (s.wins + 2) / (s.picks + 4);
        return { hero: h, score: round(s.weight * (0.6 + winRate)) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  }

  const pairList = Object.values(pairs)
    .filter((pr) => pr.games >= 2 || pr.focusGames >= 1)
    .map((pr) => ({ ...pr, weight: round(pr.weight) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 400);

  const meanConfidence = assigned.length ? round(assigned.reduce((a, l) => a + l.confidence, 0) / assigned.length) : 0;

  return {
    meta: {
      league: opts.league ?? "MPL Philippines Season 18",
      source: { name: "Liquipedia", license: "CC BY-SA 3.0", pages: opts.pages ?? [], fetchedAt: opts.fetchedAt ?? "" },
      focusTeam,
      focusWeight,
      halfLifeDays,
      games: games.length,
      focusGames: games.filter((g) => g.teams.includes(focusTeam)).length,
      latestGame: latest,
      positionConfidence: meanConfidence,
      correctedLineups: assigned.filter((l) => l.corrected).length,
      unknownHeroes: [...unknown].sort(),
      heroes,
      ranking,
      pairs: pairList
    },
    lineups: assigned.map((l) => ({
      date: l.game.date,
      match: l.game.match,
      game: l.game.game,
      team: l.team,
      opponent: l.opponent,
      won: l.won,
      positions: l.positions,
      confidence: l.confidence,
      ...(l.corrected ? { corrected: true } : {})
    }))
  };
}
