"use client";

import { useState } from "react";
import type { League, TeamChoice } from "@/lib/meta";

// Region tags and filler words left out of a team's initials: "Team Liquid PH" -> "TL".
const FILLER = new Set(["team", "esports", "gaming", "ph", "id", "my", "the"]);

function initials(name: string): string {
  const words = name.split(/[\s.]+/).filter((w) => w && !FILLER.has(w.toLowerCase()));
  if (!words.length) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// The team's logo from public/teams, or its initials when there is no logo (yet).
export function TeamLogo({ team, size = 32 }: { team: Pick<TeamChoice, "name" | "logo">; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (team.logo && !broken) {
    return <img className="team-logo" src={team.logo} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} />;
  }
  return (
    <span className="team-logo initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initials(team.name)}
    </span>
  );
}

type Props = {
  leagues: League[];
  teams: TeamChoice[];
  value: string; // team id, "" for none
  onChange: (id: string) => void;
};

export default function TeamPicker({ leagues, teams, value, onChange }: Props) {
  const selected = teams.find((t) => t.id === value) ?? null;
  const shown = leagues.filter((l) => teams.some((t) => t.league === l.id));
  const [tab, setTab] = useState(selected?.league ?? shown[0]?.id ?? "");
  const active = shown.some((l) => l.id === tab) ? tab : (selected?.league ?? shown[0]?.id ?? "");
  const league = shown.find((l) => l.id === active);

  return (
    <section className="panel team-panel" aria-labelledby="team-title">
      <div className="panel-head">
        <h2 id="team-title">Draft like a pro team</h2>
        <span className="count">{selected ? "Selected" : "Optional"}</span>
      </div>
      {selected ? (
        <p className="team-current">
          <TeamLogo team={selected} size={28} />
          <span>
            Suggestions lean towards the heroes <strong>{selected.name}</strong> plays in each position.
          </span>
          <button type="button" className="ghost small" onClick={() => onChange("")}>
            No team
          </button>
        </p>
      ) : (
        <p className="note">Pick a team and the suggestions lean towards the heroes it plays. Without one, every team counts the same.</p>
      )}

      {shown.length === 0 ? (
        <p className="note">The team list appears after the next weekly pro data update.</p>
      ) : (
        <>
          <div className="league-tabs" role="tablist" aria-label="League">
            {shown.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={l.id === active}
                className={`league-tab${l.id === active ? " on" : ""}`}
                onClick={() => setTab(l.id)}
              >
                {l.region}
                <span className="league-short">{l.short}</span>
              </button>
            ))}
          </div>
          <div className="team-grid" role="radiogroup" aria-label={league ? `${league.name} teams` : "Teams"}>
            {teams
              .filter((t) => t.league === active)
              .map((t) => (
                <label key={t.id} className={`team-card${t.id === value ? " on" : ""}`}>
                  <input type="radio" name="pro-team" value={t.id} checked={t.id === value} onChange={() => onChange(t.id)} />
                  <TeamLogo team={t} />
                  <span className="team-text">
                    <span className="team-name">{t.name}</span>
                    <span className="team-meta">
                      {t.games} {t.games === 1 ? "game" : "games"} · {t.wins}-{t.games - t.wins}
                    </span>
                  </span>
                </label>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
