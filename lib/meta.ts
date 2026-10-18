import raw from "@/data/meta.json";
import config from "@/data/meta-config.json";

// Pro league stats (MPL ID, PH and MY pooled) built every Tuesday by scripts/update-meta.mjs
// from Liquipedia (CC BY-SA 3.0).
export type PositionKey = "roam" | "marksman" | "jungler" | "mage" | "fighter";

export type PositionStat = {
  picks: number;
  wins: number;
  weight: number;
  lastPlayed: string;
};

export type HeroMeta = {
  picks: number;
  wins: number;
  bans: number;
  positions: Partial<Record<PositionKey, PositionStat>>;
};

export type Pair = { heroes: [string, string]; games: number; wins: number; weight: number };

export type League = { id: string; name: string; short: string; region: string; games: number; latestGame: string; teams: number };

// One pro team's own picks: heroes[hero][position] = [picks, wins, recency weight].
export type Team = {
  id: string; // league + name, e.g. "ph-teamliquidph"
  league: string;
  name: string;
  games: number;
  wins: number;
  lastPlayed: string;
  logo: string | null; // under public/, e.g. "/teams/ph-teamliquidph.png"
  heroes: Record<string, Partial<Record<PositionKey, [number, number, number]>>>;
};

export type Meta = {
  league: string;
  source: { name: string; license: string; pages: string[]; fetchedAt: string };
  games: number;
  latestGame: string;
  leagues?: League[];
  teams?: Team[];
  positionConfidence: number;
  heroes: Record<string, HeroMeta>;
  ranking: Record<PositionKey, { hero: string; score: number }[]>;
  pairs: Pair[];
  matchups?: Record<string, Record<string, [number, number]>>; // hero -> enemy -> [games, wins]
};

export function getMeta(): Meta {
  return raw as unknown as Meta;
}

// The teams a player can choose to draft like, without their pick data (for the page).
export type TeamChoice = Pick<Team, "id" | "league" | "name" | "games" | "wins" | "logo">;

// Teams left out of the picker (data/meta-config.json, hideTeams). Their games still count in the league stats.
const HIDDEN = new Set<string>((config as { hideTeams?: string[] }).hideTeams ?? []);

export function teamChoices(meta: Meta = getMeta()): { leagues: League[]; teams: TeamChoice[] } {
  const teams = (meta.teams ?? []).filter((t) => !HIDDEN.has(t.id)).map(({ id, league, name, games, wins, logo }) => ({ id, league, name, games, wins, logo }));
  return { leagues: meta.leagues ?? [], teams };
}

export function findTeam(id: unknown, meta: Meta = getMeta()): Team | null {
  if (typeof id !== "string" || !id || HIDDEN.has(id)) return null;
  return meta.teams?.find((t) => t.id === id) ?? null;
}

export function leagueOf(team: Team, meta: Meta = getMeta()): League | undefined {
  return meta.leagues?.find((l) => l.id === team.league);
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
