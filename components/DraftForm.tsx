"use client";

import { useEffect, useMemo, useState } from "react";

type Pick = { hero: string; role: string; why: string; risk: string };
type Backup = { hero: string; why: string };
type Result = {
  analysis: { summary: string; confidence: "low" | "medium" | "high"; picks: Pick[]; backups: Backup[]; plan: string };
  need: number;
  partial: boolean;
  rules: { enemy: string; available: string[]; unavailable: string[]; why: string; teamHas: string | null }[];
  meta: { patch: string; season: string; dataAsOf: string; dataAgeDays: number; model: string; retried: boolean };
};

type Props = { heroes: string[]; passcodeRequired: boolean; staleDays: number };

const idOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]/g, "");

const blank = (n: number) => Array.from({ length: n }, () => "");

// Reads a comma-separated list from the page link, e.g. ?bans=Hirara,Freya
function fromLink(params: URLSearchParams, key: string, size: number, canonical: Map<string, string>): string[] | null {
  const raw = params.get(key);
  if (!raw) return null;
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, size)
    .map((s) => canonical.get(idOf(s)) ?? s);
  return [...names, ...blank(size - names.length)];
}

type Group = "bans" | "enemy" | "team";

export default function DraftForm({ heroes, passcodeRequired, staleDays }: Props) {
  const [bans, setBans] = useState<string[]>(blank(10));
  const [enemy, setEnemy] = useState<string[]>(blank(5));
  const [team, setTeam] = useState<string[]>(blank(5));
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const known = useMemo(() => new Set(heroes.map(idOf)), [heroes]);

  // Prefill the boxes from the link (?bans=...&enemy=...&ours=...). Nothing is submitted.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const canonical = new Map(heroes.map((h) => [idOf(h), h]));
    const b = fromLink(params, "bans", 10, canonical);
    const e = fromLink(params, "enemy", 5, canonical);
    const t = fromLink(params, "ours", 5, canonical);
    if (b) setBans(b);
    if (e) setEnemy(e);
    if (t) setTeam(t);
  }, [heroes]);

  // Per-box state: "empty", "ok", "unknown" or "dupe".
  const status = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of [...bans, ...enemy, ...team]) {
      const id = idOf(v);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const of = (v: string) => {
      const id = idOf(v.trim());
      if (!id) return "empty";
      if (!known.has(id)) return "unknown";
      return (counts.get(id) ?? 0) > 1 ? "dupe" : "ok";
    };
    return { bans: bans.map(of), enemy: enemy.map(of), team: team.map(of) };
  }, [bans, enemy, team, known]);

  const filled = (list: string[]) => list.filter((v) => v.trim()).length;
  const anyBad = [...status.bans, ...status.enemy, ...status.team].some((s) => s === "unknown" || s === "dupe");
  const teamFilled = filled(team);
  const total = filled(bans) + filled(enemy) + teamFilled;
  const left = 5 - teamFilled;

  let blocker = "";
  if (anyBad) blocker = "Fix the highlighted boxes first. Each hero must be in the roster and used once.";
  else if (teamFilled >= 5) blocker = "Your team already has five picks.";
  else if (total === 0) blocker = "Enter at least one ban or pick.";
  else if (passcodeRequired && !passcode.trim()) blocker = "Enter the passcode.";

  function setAt(group: Group, i: number, value: string) {
    const setter = group === "bans" ? setBans : group === "enemy" ? setEnemy : setTeam;
    setter((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocker || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(passcodeRequired ? { "x-passcode": passcode } : {}) },
        body: JSON.stringify({
          bans: bans.map((v) => v.trim()).filter(Boolean),
          enemyPicks: enemy.map((v) => v.trim()).filter(Boolean),
          teamPicks: team.map((v) => v.trim()).filter(Boolean)
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "The analysis failed. Try again.");
      } else {
        setResult(data as Result);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setBans(blank(10));
    setEnemy(blank(5));
    setTeam(blank(5));
    setResult(null);
    setError("");
  }

  function renderBoxes(group: Group, values: string[], states: string[], prefix: string) {
    return (
      <div className="boxes">
        {values.map((v, i) => (
          <label key={i} className="box">
            <span className="box-label">
              {prefix} {i + 1}
            </span>
            <input
              type="text"
              list="hero-list"
              value={v}
              onChange={(e) => setAt(group, i, e.target.value)}
              placeholder="Hero"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={states[i] === "unknown" || states[i] === "dupe"}
              className={states[i] === "unknown" || states[i] === "dupe" ? "bad" : states[i] === "ok" ? "good" : ""}
            />
            {states[i] === "unknown" && <span className="hint">Not in the roster</span>}
            {states[i] === "dupe" && <span className="hint">Used twice</span>}
          </label>
        ))}
      </div>
    );
  }

  return (
    <>
      {staleDays > 7 && (
        <p className="stale" role="status">
          The patch data is {staleDays} days old. Recent balance changes may be missing from the analysis.
        </p>
      )}

      <form onSubmit={submit} className="form" noValidate>
        <datalist id="hero-list">
          {heroes.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>

        <section className="panel">
          <div className="panel-head">
            <h2>Bans</h2>
            <span className="count">{filled(bans)} / 10</span>
          </div>
          {renderBoxes("bans", bans, status.bans, "Ban")}
        </section>

        <div className="pair">
          <section className="panel enemy">
            <div className="panel-head">
              <h2>Enemy picks</h2>
              <span className="count">{filled(enemy)} / 5</span>
            </div>
            {renderBoxes("enemy", enemy, status.enemy, "Enemy")}
          </section>
          <section className="panel ours">
            <div className="panel-head">
              <h2>Our picks</h2>
              <span className="count">{teamFilled} / 5</span>
            </div>
            {renderBoxes("team", team, status.team, "Ours")}
          </section>
        </div>

        <section className="submit-row">
          <div className="options">
            {passcodeRequired && (
              <label className="inline">
                <span className="box-label">Passcode</span>
                <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="off" />
              </label>
            )}
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={reset} disabled={busy}>
              Clear
            </button>
            <button type="submit" className="primary" disabled={Boolean(blocker) || busy}>
              {busy ? "Analyzing..." : "Analyze draft"}
            </button>
          </div>
          <p className="note" aria-live="polite">
            {blocker ||
              (busy
                ? "Reading the patch data and your draft. This usually takes a few seconds."
                : `Your team has ${left} pick${left === 1 ? "" : "s"} left. The analysis recommends ${Math.min(2, left)}.`)}
          </p>
        </section>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && <Results result={result} />}
    </>
  );
}

function Results({ result }: { result: Result }) {
  const { analysis: a, meta } = result;
  const rules = result.rules ?? [];
  const ruleFor = (hero: string) => rules.find((r) => r.available.includes(hero));
  return (
    <section className="results" aria-label="Recommendation">
      <div className="results-head">
        <h2>{result.need === 1 ? "Last pick" : "Last two picks"}</h2>
        <span className={`conf conf-${a.confidence}`}>Confidence: {a.confidence}</span>
      </div>
      {a.summary && <p className="summary">{a.summary}</p>}
      {result.partial && (
        <p className="note">Only {a.picks.length} of {result.need} suggested picks fit this draft. Ask again for a full answer.</p>
      )}

      <ol className="picks">
        {a.picks.map((p, i) => (
          <li key={p.hero} className="pick">
            <div className="pick-head">
              <span className="rank">{result.need === 2 ? (i === 0 ? "First" : "Then") : "Pick"}</span>
              <strong>{p.hero}</strong>
              {p.role && <span className="role">{p.role}</span>}
              {ruleFor(p.hero) && <span className="rule-tag">Your rule vs {ruleFor(p.hero)!.enemy}</span>}
            </div>
            {p.why && <p>{p.why}</p>}
            {p.risk && <p className="risk">Risk: {p.risk}</p>}
          </li>
        ))}
      </ol>

      {rules.length > 0 && (
        <div className="rules">
          <h3>Your counter rules</h3>
          <ul>
            {rules.map((r) => (
              <li key={r.enemy}>
                <strong>{r.enemy}</strong>
                {r.teamHas
                  ? ` · already countered by your ${r.teamHas}`
                  : ` → ${r.available.length ? r.available.join(" or ") : "no counter left"}`}
                {!r.teamHas && r.unavailable.length > 0 && <span className="muted"> ({r.unavailable.join(", ")} banned or taken)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.plan && (
        <p className="plan">
          <strong>Plan:</strong> {a.plan}
        </p>
      )}

      {a.backups.length > 0 && (
        <div className="backups">
          <h3>Backups</h3>
          <ul>
            {a.backups.map((b) => (
              <li key={b.hero}>
                <strong>{b.hero}</strong>
                {b.why ? ` · ${b.why}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="fineprint">
        Based on patch {meta.patch} ({meta.season}) data as of {meta.dataAsOf}, analyzed by {meta.model}. This is an AI estimate from supplied data, not live win
        rates. Check the current patch before you lock in.
      </p>
    </section>
  );
}
