import raw from "@/data/meta.json";

// Pro league stats built daily by scripts/update-meta.mjs from Liquipedia (CC BY-SA 3.0).
export type PositionKey = "roam" | "marksman" | "jungler" | "mage" | "fighter";

export type PositionStat = {
  picks: number;
  wins: number;
  focusPicks: number;
  focusWins: number;
  weight: number;
  lastPlayed: string;
};

export type HeroMeta = {
  picks: number;
  wins: number;
  bans: number;
  positions: Partial<Record<PositionKey, PositionStat>>;
};

export type Pair = { heroes: [string, string]; games: number; wins: number; focusGames: number; focusWins: number; weight: number };

export type Meta = {
  league: string;
  source: { name: string; license: string; pages: string[]; fetchedAt: string };
  focusTeam: string;
  focusWeight: number;
  games: number;
  focusGames: number;
  latestGame: string;
  positionConfidence: number;
  heroes: Record<string, HeroMeta>;
  ranking: Record<PositionKey, { hero: string; score: number }[]>;
  pairs: Pair[];
  matchups?: Record<string, Record<string, [number, number]>>; // hero -> enemy -> [games, wins]
};

export function getMeta(): Meta {
  return raw as unknown as Meta;
}

export function hasMeta(meta: Meta = getMeta()): boolean {
  return meta.games > 0;
}

// Positions pros actually play a hero in: at least 15% of its picks, or 3 games.
// Returns null when the hero has too few pro picks (fewer than 3) to say.
export function metaPositions(hero: string, meta: Meta = getMeta()): PositionKey[] | null {
  const h = meta.heroes[hero];
  if (!h || h.picks < 3) return null;
  return (Object.entries(h.positions) as [PositionKey, PositionStat][])
    .filter(([, s]) => s.picks >= 3 || s.picks / h.picks >= 0.15)
    .map(([p]) => p);
}
