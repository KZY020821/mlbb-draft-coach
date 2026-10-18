"use client";

import { useState } from "react";
import type { League, TeamChoice } from "@/lib/meta";
import Dropdown from "./Dropdown";
import Flag from "./Flag";

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

// League order in the picker.
const LEAGUE_ORDER = ["my", "id", "ph"];

const record = (t: TeamChoice) => `${t.games} ${t.games === 1 ? "game" : "games"} · ${t.wins}-${t.games - t.wins}`;

// Two steps: the league (with its country's flag), then one of its teams (with the team's logo).
export default function TeamPicker({ leagues, teams, value, onChange }: Props) {
  const selected = teams.find((t) => t.id === value) ?? null;
  const shown = leagues
    .filter((l) => teams.some((t) => t.league === l.id))
    .sort((a, b) => LEAGUE_ORDER.indexOf(a.id) - LEAGUE_ORDER.indexOf(b.id));
  const [pickedLeague, setPickedLeague] = useState("");
  const league = selected?.league ?? pickedLeague;

  function chooseLeague(id: string) {
    setPickedLeague(id);
    if (selected && selected.league !== id) onChange("");
  }

  return (
    <section className="panel team-panel" aria-labelledby="team-title">
      <div className="panel-head">
        <h2 id="team-title">
          <span className="step">1</span>Draft like a pro team
        </h2>
        <span className="count">Optional</span>
      </div>

      {shown.length === 0 ? (
        <p className="note">The team list appears after the next weekly pro data update.</p>
      ) : (
        <>
          <div className="team-selects">
            <Dropdown
              label="League"
              placeholder="Choose a league"
              value={league}
              onChange={chooseLeague}
              options={shown.map((l) => ({ value: l.id, label: l.region, detail: l.short, icon: <Flag league={l.id} /> }))}
            />
            <Dropdown
              label="Team"
              placeholder={league ? "Choose a team" : "Choose a league first"}
              disabled={!league}
              value={value}
              onChange={onChange}
              options={teams
                .filter((t) => t.league === league)
                .map((t) => ({ value: t.id, label: t.name, detail: record(t), icon: <TeamLogo team={t} size={28} /> }))}
            />
          </div>
          {selected ? (
            <div className="team-current">
              <TeamLogo team={selected} size={36} />
              <p>
                Suggestions lean towards the heroes <strong>{selected.name}</strong> plays in each position.
              </p>
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  setPickedLeague(selected.league);
                  onChange("");
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="note">Pick a team and the suggestions lean towards the heroes it plays. Without one, every team counts the same.</p>
          )}
        </>
      )}
    </section>
  );
}
