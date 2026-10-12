import type { Hero } from "./context";
import { resolveHero, type HeroIndex } from "./heroes";
import { POSITIONS, POSITION_LABEL, fitsPosition, positionFromText, type Position } from "./positions";
import type { AppliedRule } from "./rules";

export type TeamPick = { position: Position; hero: Hero };

export type Draft = {
  bans: Hero[];
  enemy: Hero[];
  team: TeamPick[];
  open: Position[]; // our positions that still need a hero, in form order
};

export type ParsedRequest =
  | { ok: true; draft: Draft; need: number }
  | { ok: false; message: string };

function cleanName(value: unknown, label: string): { name: string; error?: string } {
  if (value === undefined || value === null) return { name: "" };
  if (typeof value !== "string") return { name: "", error: `${label} must be a hero name.` };
  const name = value.trim();
  if (name.length > 40) return { name: "", error: `${label} has a name that is too long.` };
  return { name };
}

function names(value: unknown, max: number, label: string): { list: string[]; error?: string } {
  if (value === undefined || value === null) return { list: [] };
  if (!Array.isArray(value)) return { list: [], error: `${label} must be a list.` };
  if (value.length > max) return { list: [], error: `${label} can hold at most ${max} heroes.` };
  const list: string[] = [];
  for (const item of value) {
    const { name, error } = cleanName(item, label);
    if (error) return { list: [], error };
    if (name) list.push(name);
  }
  return { list };
}

export function parseRequest(body: unknown, index: HeroIndex): ParsedRequest {
  if (!body || typeof body !== "object") return { ok: false, message: "Send the draft as a JSON object." };
  const b = body as Record<string, unknown>;
  const unknown: string[] = [];

  const resolveAll = (list: string[]) =>
    list.flatMap((n) => {
      const hero = resolveHero(index, n);
      if (!hero) unknown.push(n);
      return hero ? [hero] : [];
    });

  const bansIn = names(b.bans, 10, "Bans");
  if (bansIn.error) return { ok: false, message: bansIn.error };
  const enemyIn = names(b.enemyPicks, 5, "Enemy picks");
  if (enemyIn.error) return { ok: false, message: enemyIn.error };
  const bans = resolveAll(bansIn.list);
  const enemy = resolveAll(enemyIn.list);

  // Our picks are given by position: { roam, marksman, jungler, mage, fighter }.
  const tp = b.teamPicks;
  if (tp !== undefined && tp !== null && (typeof tp !== "object" || Array.isArray(tp))) {
    return { ok: false, message: "Team picks must be given by position (roam, marksman, jungler, mage, fighter)." };
  }
  const tpObj = (tp ?? {}) as Record<string, unknown>;
  const extraKeys = Object.keys(tpObj).filter((k) => !(POSITIONS as readonly string[]).includes(k));
  if (extraKeys.length) return { ok: false, message: `Unknown team position: ${extraKeys.join(", ")}.` };

  const team: TeamPick[] = [];
  const open: Position[] = [];
  for (const position of POSITIONS) {
    const { name, error } = cleanName(tpObj[position], POSITION_LABEL[position]);
    if (error) return { ok: false, message: error };
    if (!name) {
      open.push(position);
      continue;
    }
    const hero = resolveHero(index, name);
    if (hero) team.push({ position, hero });
    else unknown.push(name);
  }

  if (unknown.length) {
    return { ok: false, message: `These are not heroes in the roster: ${unknown.join(", ")}.` };
  }

  const all = [...bans, ...enemy, ...team.map((t) => t.hero)];
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const h of all) {
    if (seen.has(h.name)) dupes.add(h.name);
    seen.add(h.name);
  }
  if (dupes.size) {
    return { ok: false, message: `A hero can appear only once in a draft: ${[...dupes].join(", ")}.` };
  }

  if (open.length === 0) return { ok: false, message: "Your team already has five picks." };
  if (all.length === 0) return { ok: false, message: "Enter at least one ban or pick." };

  return { ok: true, draft: { bans, enemy, team, open }, need: Math.min(2, open.length) };
}

export function teamHeroes(draft: Draft): Hero[] {
  return draft.team.map((t) => t.hero);
}

export type Pick = { hero: string; position: Position; why: string; risk: string };
export type Backup = { hero: string; position: Position; why: string };
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
  ruleIgnored: boolean;
};

function text(v: unknown, max = 600): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Parse the model's JSON and keep only heroes that exist, are still available,
// and are played in the open position they were suggested for.
export function checkAnalysis(raw: string, index: HeroIndex, draft: Draft, need: number, applied: AppliedRule[] = []): Checked {
  const problems: string[] = [];
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
    else problems.push("The reply was not a JSON object.");
  } catch {
    problems.push("The reply was not valid JSON.");
  }

  const unavailable = new Set([...draft.bans, ...draft.enemy, ...teamHeroes(draft)].map((h) => h.name));
  const used = new Set<string>();
  const openList = draft.open.map((p) => POSITION_LABEL[p]).join(", ");

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
    return hero;
  }

  // The position a suggestion is for: what the model said, or the only open one.
  function positionFor(hero: Hero, said: unknown, taken: Set<Position>): Position | undefined {
    let position = positionFromText(said);
    if (!position && draft.open.length === 1) position = draft.open[0];
    if (!position || !draft.open.includes(position)) {
      problems.push(`${hero.name} was suggested for "${String(said ?? "")}", but the open positions are: ${openList}.`);
      return undefined;
    }
    if (taken.has(position)) {
      problems.push(`More than one pick was suggested for ${POSITION_LABEL[position]}. Suggest one hero per open position.`);
      return undefined;
    }
    if (!fitsPosition(hero, position)) {
      const lanes = hero.lanes?.length ? `lanes: ${hero.lanes.join("/")}` : `roles: ${hero.roles.join("/")}`;
      problems.push(`${hero.name} is not played as ${POSITION_LABEL[position]} (${lanes}).`);
      return undefined;
    }
    return position;
  }

  const picks: Pick[] = [];
  const filled = new Set<Position>();
  for (const item of Array.isArray(data.picks) ? data.picks : []) {
    if (picks.length >= need) break;
    const rec = (item ?? {}) as Record<string, unknown>;
    const hero = usable(rec.hero);
    if (!hero) continue;
    const position = positionFor(hero, rec.position, filled);
    if (!position) continue;
    used.add(hero.name);
    filled.add(position);
    picks.push({ hero: hero.name, position, why: text(rec.why), risk: text(rec.risk, 300) });
  }
  if (picks.length < need) problems.push(`Only ${picks.length} of ${need} requested picks were usable.`);

  // At least one open counter rule should be honoured in the picks.
  const openRules = applied.filter((r) => !r.teamHas && r.available.length);
  const counters = new Set(openRules.flatMap((r) => r.available));
  const ruleIgnored = openRules.length > 0 && !picks.some((p) => counters.has(p.hero));
  if (ruleIgnored) {
    for (const r of openRules) {
      problems.push(`The enemy picked ${r.enemy}. Our team's counter rule says to pick ${r.available.join(" or ")}, but none of them is in picks.`);
    }
  }

  // Backups may repeat a position; they only need to fit an open one.
  const backups: Backup[] = [];
  for (const item of Array.isArray(data.backups) ? data.backups : []) {
    if (backups.length >= 3) break;
    const rec = (item ?? {}) as Record<string, unknown>;
    const hero = usable(rec.hero);
    if (!hero) continue;
    const position = positionFor(hero, rec.position, new Set());
    if (!position) continue;
    used.add(hero.name);
    backups.push({ hero: hero.name, position, why: text(rec.why, 300) });
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
    problems,
    ruleIgnored
  };
}
