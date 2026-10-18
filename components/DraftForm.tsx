"use client";

import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/access";

type PositionKey = "roam" | "marksman" | "jungler" | "mage" | "fighter";

// Our team's boxes, in order. The key is also the link parameter (?roam=Estes).
const TEAM_SLOTS: { key: PositionKey; label: string; lane?: string }[] = [
  { key: "roam", label: "Roam" },
  { key: "marksman", label: "Marksman", lane: "Gold" },
  { key: "jungler", label: "Jungler" },
  { key: "mage", label: "Mage", lane: "Mid" },
  { key: "fighter", label: "Fighter", lane: "EXP" }
];
const SLOT_LABEL = Object.fromEntries(TEAM_SLOTS.map((s) => [s.key, s.label])) as Record<PositionKey, string>;

type Tag = "pro" | "focus" | "rule" | "pair" | "counter" | "tier";
type Option = {
  hero: string;
  confidence: "high" | "medium" | "low";
  why: string;
  risk: string;
  tags: Tag[];
  evidence: string;
  score?: number;
  picks: number;
  wins: number;
  focusPicks: number;
  focusWins: number;
};
type Slot = { position: PositionKey; options: Option[] };
type Rule = { enemy: string; available: string[]; unavailable: string[]; offPosition: string[]; why: string; teamHas: string | null };
type Result = {
  analysis: { summary: string; plan: string; slots: Slot[] };
  analysisId?: number | null;
  account?: Account | null;
  need: number;
  partial: boolean;
  open: PositionKey[];
  rules: Rule[];
  meta: {
    patch: string;
    season: string;
    dataAsOf: string;
    dataAgeDays: number;
    model: string;
    retried: boolean;
    pro: { league: string; games: number; focusTeam: string; focusGames: number; latestGame: string; source: string; license: string };
  };
};

type Props = { heroes: string[]; passcodeRequired: boolean; staleDays: number; accountsOn: boolean; account: Account | null };

const rmOf = (sen: number) => `RM${(sen / 100).toFixed(2).replace(/\.00$/, "")}`;

// One line about what this account can do, shown under the Analyze button.
function planLine(a: Account): string {
  if (a.plan === "owner") return "Owner account: unlimited analyses.";
  if (a.plan === "comp") return "Free access: analyses are on us.";
  if (a.plan === "subscriber") return `Coach plan${a.periodEnd ? ` until ${new Date(a.periodEnd).toLocaleDateString()}` : ""}.`;
  return a.trialLeft > 0
    ? `Free analyses left: ${a.trialLeft} of ${a.trialTotal}.`
    : `Your free analyses are used. The Coach plan is ${rmOf(a.priceSen)} a month; subscriptions are opening soon.`;
}

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

const listOf = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

type Group = "bans" | "enemy" | "team";

export default function DraftForm({ heroes, passcodeRequired, staleDays, accountsOn, account: initialAccount }: Props) {
  const [account, setAccount] = useState<Account | null>(initialAccount);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [bans, setBans] = useState<string[]>(blank(10));
  const [enemy, setEnemy] = useState<string[]>(blank(5));
  const [team, setTeam] = useState<string[]>(blank(5)); // same order as TEAM_SLOTS
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const known = useMemo(() => new Set(heroes.map(idOf)), [heroes]);

  // Prefill from the link: ?bans=a,b&enemy=c,d&roam=e&marksman=f&jungler=g&mage=h&fighter=i
  // Nothing is submitted.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const canonical = new Map(heroes.map((h) => [idOf(h), h]));
    const b = fromLink(params, "bans", 10, canonical);
    const e = fromLink(params, "enemy", 5, canonical);
    if (b) setBans(b);
    if (e) setEnemy(e);
    if (TEAM_SLOTS.some((s) => params.get(s.key))) {
      setTeam(TEAM_SLOTS.map((s) => (fromLink(params, s.key, 1, canonical) ?? [""])[0]));
    }
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
  const openSlots = TEAM_SLOTS.filter((_, i) => !team[i].trim());
  const total = filled(bans) + filled(enemy) + filled(team);

  let blocker = "";
  if (anyBad) blocker = "Fix the highlighted boxes first. Each hero must be in the roster and used once.";
  else if (openSlots.length === 0) blocker = "Your team already has five picks.";
  else if (total === 0) blocker = "Enter at least one ban or pick.";
  else if (passcodeRequired && !passcode.trim()) blocker = "Enter the passcode.";
  else if (accountsOn && !account) blocker = "Sign in with Google to run the analysis. Every account gets free analyses.";
  else if (account && account.plan === "free" && account.trialLeft <= 0) blocker = planLine(account);

  const openNote =
    openSlots.length <= 2
      ? `Your team still needs: ${listOf(openSlots.map((s) => s.label))}. The analysis suggests a hero for ${openSlots.length === 1 ? "it" : "each"}.`
      : `Your team still needs: ${listOf(openSlots.map((s) => s.label))}. The analysis suggests heroes for the 2 that matter most now.`;

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
      const teamPicks = Object.fromEntries(TEAM_SLOTS.map((s, i) => [s.key, team[i].trim()]).filter(([, v]) => v));
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(passcodeRequired ? { "x-passcode": passcode } : {}) },
        body: JSON.stringify({
          bans: bans.map((v) => v.trim()).filter(Boolean),
          enemyPicks: enemy.map((v) => v.trim()).filter(Boolean),
          teamPicks
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "The analysis failed. Try again.");
        if (data?.error?.code === "sign_in") setNeedSignIn(true);
        if (data?.error?.code === "subscribe" && account) setAccount({ ...account, trialLeft: 0 });
      } else {
        setResult(data as Result);
        if (data?.account) setAccount(data.account);
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

  function input(group: Group, i: number, value: string, state: string) {
    return (
      <>
        <input
          type="text"
          list="hero-list"
          value={value}
          onChange={(e) => setAt(group, i, e.target.value)}
          placeholder={group === "team" ? "Open" : "Hero"}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state === "unknown" || state === "dupe"}
          className={state === "unknown" || state === "dupe" ? "bad" : state === "ok" ? "good" : group === "team" ? "open" : ""}
        />
        {state === "unknown" && <span className="hint">Not in the roster</span>}
        {state === "dupe" && <span className="hint">Used twice</span>}
      </>
    );
  }

  function renderBoxes(group: "bans" | "enemy", values: string[], states: string[], prefix: string) {
    return (
      <div className="boxes">
        {values.map((v, i) => (
          <label key={i} className="box">
            <span className="box-label">
              {prefix} {i + 1}
            </span>
            {input(group, i, v, states[i])}
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
              <span className="count">{filled(team)} / 5</span>
            </div>
            <div className="boxes">
              {TEAM_SLOTS.map((s, i) => (
                <label key={s.key} className="box">
                  <span className="box-label">
                    {s.label}
                    {s.lane && <span className="lane"> · {s.lane}</span>}
                  </span>
                  {input("team", i, team[i], status.team[i])}
                </label>
              ))}
            </div>
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
            {blocker || (busy ? "Reading the patch data and your draft. This usually takes a few seconds." : openNote)}
          </p>
          {accountsOn && !account && (
            <a className="primary signin" href="/api/auth/google">
              Sign in with Google
            </a>
          )}
          {account && !blocker && <p className="note plan-line">{planLine(account)}</p>}
        </section>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
          {needSignIn && (
            <>
              {" "}
              <a href="/api/auth/google">Sign in with Google</a>
            </>
          )}
        </p>
      )}

      {result && <Results result={result} />}
    </>
  );
}

function Results({ result }: { result: Result }) {
  const { analysis: a, meta } = result;
  const [picked, setPicked] = useState<Record<string, string>>({});
  async function markPicked(position: string, hero: string) {
    if (!result.analysisId) return;
    setPicked((p) => ({ ...p, [position]: hero }));
    await fetch("/api/picked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId: result.analysisId, hero })
    }).catch(() => undefined);
  }
  const rules = result.rules ?? [];
  const ruleFor = (hero: string) => rules.find((r) => r.available.includes(hero));
  const pro = meta.pro;
  return (
    <section className="results" aria-label="Recommendation">
      <div className="results-head">
        <h2>{a.slots.length === 1 ? `Options for ${SLOT_LABEL[a.slots[0].position]}` : "Options for your open positions"}</h2>
      </div>
      {a.summary && <p className="summary">{a.summary}</p>}
      {result.partial && <p className="note">Some positions came back with fewer than three usable options. Ask again for a full set.</p>}

      {a.slots.map((s, si) => (
        <div key={s.position} className="slot">
          <h3 className="slot-title">
            {a.slots.length > 1 && <span className="rank">{si === 0 ? "Lock first" : "Then"}</span>} {SLOT_LABEL[s.position]}
            <span className="slot-hint"> · pick the one you play best</span>
          </h3>
          <ol className="picks">
            {s.options.map((o, i) => (
              <li key={o.hero} className="pick">
                <div className="pick-head">
                  <span className="rank">#{i + 1}</span>
                  <strong>{o.hero}</strong>
                  <span className={`conf conf-${o.confidence}`}>{o.confidence}</span>
                  {typeof o.score === "number" && <span className="pos" title="Pro data score out of 100">Score {o.score}</span>}
                  {o.tags?.includes("counter") && <span className="pos counter-tag">Counter</span>}
                  {ruleFor(o.hero) && <span className="rule-tag">Your rule vs {ruleFor(o.hero)!.enemy}</span>}
                  {result.analysisId ? (
                    <button
                      type="button"
                      className={`pick-btn${picked[s.position] === o.hero ? " on" : ""}`}
                      onClick={() => markPicked(s.position, o.hero)}
                      aria-pressed={picked[s.position] === o.hero}
                    >
                      {picked[s.position] === o.hero ? "Picked" : "I picked this"}
                    </button>
                  ) : null}
                </div>
                {o.evidence && <p className="evidence">{o.evidence}</p>}
                {o.why && <p>{o.why}</p>}
                {o.risk && <p className="risk">Risk: {o.risk}</p>}
              </li>
            ))}
          </ol>
        </div>
      ))}

      {rules.length > 0 && (
        <div className="rules">
          <h3>Your counter rules</h3>
          <ul>
            {rules.map((r) => (
              <li key={r.enemy}>
                <strong>{r.enemy}</strong>
                {r.teamHas
                  ? ` · already countered by your ${r.teamHas}`
                  : ` → ${r.available.length ? r.available.join(" or ") : "no counter fits an open position"}`}
                {!r.teamHas && r.unavailable.length > 0 && <span className="muted"> ({r.unavailable.join(", ")} banned or taken)</span>}
                {!r.teamHas && r.offPosition.length > 0 && <span className="muted"> ({r.offPosition.join(", ")} not for an open position)</span>}
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

      <p className="fineprint">
        {pro.games > 0 ? (
          <>
            Pro data: {pro.league}, {pro.games} games up to {pro.latestGame} ({pro.focusGames} by {pro.focusTeam}, weighted slightly higher), from{" "}
            <a href="https://liquipedia.net/mobilelegends/" target="_blank" rel="noreferrer">
              Liquipedia
            </a>{" "}
            ({pro.license}). Positions are inferred from picks.{" "}
          </>
        ) : (
          <>No pro data loaded yet, so options come from the tier list. </>
        )}
        Patch {meta.patch} ({meta.season}), analyzed by {meta.model}. An AI estimate, not live win rates.
      </p>
    </section>
  );
}
