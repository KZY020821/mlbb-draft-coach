import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { accountsEnabled, currentUser, isOwner, ownerEmail } from "@/lib/session";
import { getPrice, rm } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import {
  compEmails,
  deepseekBalance,
  errorsThisMonth,
  picksReport,
  profitByMonth,
  recentPayments,
  subscriberCounts,
  topSpenders,
  usageByDay,
  usersList
} from "@/lib/admin";
import { monthSpendUsd } from "@/lib/access";
import { getModel } from "@/lib/deepseek";
import * as act from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · MLBB Draft Coach", robots: { index: false, follow: false } };

const TABS = [
  ["overview", "Profit"],
  ["pricing", "Price"],
  ["usage", "API usage"],
  ["free", "Free emails"],
  ["users", "Users"],
  ["picks", "Picks data"]
] as const;
type Tab = (typeof TABS)[number][0];

const POS_LABEL: Record<string, string> = { roam: "Roam", marksman: "Marksman", jungler: "Jungler", mage: "Mage", fighter: "Fighter" };
const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const date = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }) : "–";
const dateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type SP = Promise<{ tab?: string; msg?: string; err?: string; q?: string }>;

export default async function Admin({ searchParams }: { searchParams: SP }) {
  if (!accountsEnabled()) notFound();
  const user = await currentUser();
  if (!user) redirect("/api/auth/google?next=/admin");
  if (!isOwner(user.email)) notFound();

  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as Tab;

  return (
    <main className="shell admin">
      <nav className="account">
        <span className="who">{user.email}</span>
        <a className="ghost small" href="/">
          Back to the coach
        </a>
      </nav>
      <header className="top">
        <p className="kicker">Owner only</p>
        <h1>Admin</h1>
      </header>
      <nav className="tabs" aria-label="Admin sections">
        {TABS.map(([k, label]) => (
          <a key={k} href={`/admin?tab=${k}`} className={k === tab ? "on" : ""} aria-current={k === tab ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {sp.msg && <p className="msg" role="status">{sp.msg}</p>}
      {sp.err && <p className="msg err" role="alert">{sp.err}</p>}

      {tab === "overview" && <Overview />}
      {tab === "pricing" && <Pricing />}
      {tab === "usage" && <Usage />}
      {tab === "free" && <Free />}
      {tab === "users" && <Users q={sp.q ?? ""} />}
      {tab === "picks" && <Picks />}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

async function Overview() {
  const [profit, subs, price] = await Promise.all([profitByMonth(6), subscriberCounts(), getPrice()]);
  const [cur, prev] = profit.rows;
  return (
    <>
      <section className="panel">
        <h2>This month ({cur.month})</h2>
        <div className="stat-row">
          <Stat label="Revenue" value={rm(cur.revenueSen)} />
          <Stat label="Payment fees" value={rm(cur.feesSen)} />
          <Stat label="AI cost" value={rm(cur.aiSen)} />
          <Stat label="Fixed costs" value={rm(cur.fixedSen)} />
          <Stat label="Profit" value={rm(cur.profitSen)} tone={cur.profitSen >= 0 ? "pos" : "neg"} />
        </div>
        <div className="stat-row">
          <Stat label="Active subscribers" value={n(subs.active)} />
          <Stat label="Monthly recurring" value={rm(subs.active * price.currentSen)} />
          <Stat label="Accounts" value={`${n(subs.users)} · +${n(subs.new_users)} new`} />
          <Stat label="Tried the coach" value={`${n(subs.tried)} (${pct(subs.tried, subs.users)})`} />
          <Stat label="Last month profit" value={prev ? rm(prev.profitSen) : "–"} tone={prev && prev.profitSen < 0 ? "neg" : undefined} />
        </div>
      </section>
      <section className="panel">
        <h2>By month</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Payments</th>
                <th className="num">Revenue</th>
                <th className="num">Fees</th>
                <th className="num">Analyses</th>
                <th className="num">AI cost</th>
                <th className="num">Fixed</th>
                <th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {profit.rows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td className="num">{n(r.payments)}</td>
                  <td className="num">{rm(r.revenueSen)}</td>
                  <td className="num">{rm(r.feesSen)}</td>
                  <td className="num">{n(r.analyses)}</td>
                  <td className="num">
                    {rm(r.aiSen)} <span className="muted">({usd(r.aiUsd)})</span>
                  </td>
                  <td className="num">{rm(r.fixedSen)}</td>
                  <td className="num">{rm(r.profitSen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fineprint">
          Profit = revenue − payment fees − AI cost (at USD 1 = RM{profit.usdToMyr}) − fixed costs (RM{profit.fixedMonthlyCostRm} a month). Change the rate and fixed
          costs under API usage. Fixed costs count from the month the first account signed up. Months are Malaysia time.
        </p>
      </section>
    </>
  );
}

async function Pricing() {
  const price = await getPrice();
  return (
    <section className="panel">
      <h2>Coach plan price</h2>
      <div className="stat-row">
        <Stat label="Current price" value={`${rm(price.currentSen)} / month`} />
        <Stat label="Next month" value={price.scheduled ? `${rm(price.scheduled.priceSen)} from ${date(price.scheduled.effectiveFrom)}` : "No change"} />
      </div>
      <form action={act.setPrice} className="row">
        <label>
          New monthly price (RM)
          <input type="number" name="price" min="1" max="1000" step="0.01" required defaultValue={((price.scheduled?.priceSen ?? price.currentSen) / 100).toFixed(2)} />
        </label>
        <button className="primary" type="submit">
          Apply from next month
        </button>
      </form>
      {price.scheduled && (
        <form action={act.cancelPrice} className="row">
          <button className="ghost" type="submit">
            Cancel the scheduled change
          </button>
        </form>
      )}
      <p className="fineprint">
        A new price always starts on the 1st of next month (Malaysia time). Saving again replaces the scheduled change. Existing paid periods keep the price they were paid at.
      </p>
    </section>
  );
}

async function Usage() {
  const [settings, days, errors, balance, spend, spenders] = await Promise.all([
    getSettings(),
    usageByDay(14),
    errorsThisMonth(),
    deepseekBalance(),
    monthSpendUsd(),
    topSpenders(10)
  ]);
  const today = days[0];
  return (
    <>
      <section className="panel">
        <h2>DeepSeek</h2>
        <div className="stat-row">
          <Stat label="Balance" value={balance ? balance.map((b) => `${b.total} ${b.currency}`).join(" · ") || "–" : "Unavailable"} />
          <Stat label="Spent this month" value={`${usd(spend)} of ${usd(settings.monthlyBudgetUsd)}`} tone={spend >= settings.monthlyBudgetUsd ? "neg" : undefined} />
          <Stat label="Analyses today" value={`${n(today.ok)} ok · ${n(today.errors)} failed`} />
          <Stat label="Cost today" value={usd(today.costUsd)} />
          <Stat label="Model" value={getModel()} />
        </div>
      </section>

      <section className="panel">
        <h2>Controls</h2>
        <form action={act.saveSettings} className="row">
          <label className="switch">
            <input type="checkbox" name="aiEnabled" defaultChecked={settings.aiEnabled} /> AI coach on for everyone
          </label>
          <label>
            Free analyses per account
            <input type="number" name="trialAnalyses" min="0" max="50" defaultValue={settings.trialAnalyses} />
          </label>
          <label>
            Daily limit per account
            <input type="number" name="dailyCap" min="1" defaultValue={settings.dailyCap} />
          </label>
          <label>
            Monthly limit per account
            <input type="number" name="monthlyCap" min="1" defaultValue={settings.monthlyCap} />
          </label>
          <label>
            Monthly AI budget (USD)
            <input type="number" name="monthlyBudgetUsd" min="0" step="0.01" defaultValue={settings.monthlyBudgetUsd} />
          </label>
          <label>
            USD to RM
            <input type="number" name="usdToMyr" min="0.5" step="0.01" defaultValue={settings.usdToMyr} />
          </label>
          <label>
            Fixed costs (RM / month)
            <input type="number" name="fixedMonthlyCostRm" min="0" step="0.01" defaultValue={settings.fixedMonthlyCostRm} />
          </label>
          <label>
            Input $/1M (cache miss)
            <input type="number" name="priceInputMissPerM" min="0" step="0.001" defaultValue={settings.priceInputMissPerM} />
          </label>
          <label>
            Input $/1M (cache hit)
            <input type="number" name="priceInputHitPerM" min="0" step="0.001" defaultValue={settings.priceInputHitPerM} />
          </label>
          <label>
            Output $/1M
            <input type="number" name="priceOutputPerM" min="0" step="0.001" defaultValue={settings.priceOutputPerM} />
          </label>
          <button className="primary" type="submit">
            Save
          </button>
        </form>
        <p className="fineprint">
          Turning the coach off, or reaching the monthly budget, pauses analyses for everyone except you. Limits apply to subscribers and free-list accounts. Token
          prices are used to estimate cost; check DeepSeek&apos;s pricing page when it changes.
        </p>
      </section>

      <section className="panel">
        <h2>Last 14 days</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">OK</th>
                <th className="num">Failed</th>
                <th className="num">Retried</th>
                <th className="num">Input tokens</th>
                <th className="num">Cache hits</th>
                <th className="num">Output tokens</th>
                <th className="num">Cost</th>
                <th className="num">Avg time</th>
                <th className="num">p95 time</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td className="num">{n(d.ok)}</td>
                  <td className="num">{n(d.errors)}</td>
                  <td className="num">{n(d.retried)}</td>
                  <td className="num">{n(d.promptTokens)}</td>
                  <td className="num">{pct(d.cacheHitTokens, d.promptTokens)}</td>
                  <td className="num">{n(d.completionTokens)}</td>
                  <td className="num">{usd(d.costUsd)}</td>
                  <td className="num">{d.avgMs ? `${(d.avgMs / 1000).toFixed(1)}s` : "–"}</td>
                  <td className="num">{d.p95Ms ? `${(d.p95Ms / 1000).toFixed(1)}s` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <h2>Failures this month</h2>
          {errors.length ? (
            <table className="data">
              <tbody>
                {errors.map((e) => (
                  <tr key={e.code}>
                    <td>{e.code || "unknown"}</td>
                    <td className="num">{n(e.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="note">None.</p>
          )}
        </section>
        <section className="panel">
          <h2>Top accounts by cost this month</h2>
          {spenders.length ? (
            <table className="data">
              <tbody>
                {spenders.map((s) => (
                  <tr key={s.email}>
                    <td>{s.email}</td>
                    <td className="num">{n(s.analyses)}</td>
                    <td className="num">{usd(Number(s.cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="note">No analyses yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

async function Free() {
  const list = await compEmails();
  return (
    <section className="panel">
      <h2>Free access</h2>
      <p className="note">
        These accounts get unlimited analyses (within the fair-use limits) without paying. Your own account ({ownerEmail()}) is always free and needs no entry.
      </p>
      <form action={act.addComp} className="row">
        <label>
          Email
          <input type="email" name="email" required placeholder="player@gmail.com" />
        </label>
        <label>
          Note
          <input type="text" name="note" placeholder="Team coach, tester..." maxLength={200} />
        </label>
        <button className="primary" type="submit">
          Add
        </button>
      </form>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Email</th>
              <th>Note</th>
              <th>Added</th>
              <th>Signed in</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.email}>
                <td>{c.email}</td>
                <td>{c.note}</td>
                <td>{date(c.added_at)}</td>
                <td>{c.signed_up ? "Yes" : "Not yet"}</td>
                <td>
                  <form action={act.removeComp}>
                    <input type="hidden" name="email" value={c.email} />
                    <button className="ghost small" type="submit">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No free emails yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Users({ q }: { q: string }) {
  const [users, payments, settings] = await Promise.all([usersList(q, 100), recentPayments(20), getSettings()]);
  return (
    <>
      <section className="panel">
        <h2>Record a payment</h2>
        <p className="note">Until online payments are connected, record a bank transfer or DuitNow payment here. It gives that account the Coach plan, added on to any time they have left.</p>
        <form action={act.recordPayment} className="row">
          <label>
            Account email
            <input type="email" name="email" required />
          </label>
          <label>
            Amount (RM)
            <input type="number" name="amount" min="0" step="0.01" required />
          </label>
          <label>
            Fee (RM)
            <input type="number" name="fee" min="0" step="0.01" defaultValue="0" />
          </label>
          <label>
            Months
            <input type="number" name="months" min="1" max="24" defaultValue="1" />
          </label>
          <label>
            Reference
            <input type="text" name="ref" maxLength={100} />
          </label>
          <button className="primary" type="submit">
            Record
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Accounts</h2>
        <form className="row" action="/admin" method="get">
          <input type="hidden" name="tab" value="users" />
          <label>
            Search
            <input type="text" name="q" defaultValue={q} placeholder="Email or name" />
          </label>
          <button className="ghost" type="submit">
            Search
          </button>
        </form>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Plan</th>
                <th>Until</th>
                <th className="num">Free used</th>
                <th className="num">Analyses</th>
                <th className="num">Marked picks</th>
                <th className="num">Paid</th>
                <th>Joined</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td title={u.name}>{u.email}</td>
                  <td>{u.plan}</td>
                  <td>{date(u.period_end)}</td>
                  <td className="num">
                    {u.trial_used} / {settings.trialAnalyses}
                  </td>
                  <td className="num">{n(u.analyses)}</td>
                  <td className="num">{n(u.picked)}</td>
                  <td className="num">{rm(u.paid_sen)}</td>
                  <td>{date(u.created_at)}</td>
                  <td>{date(u.last_seen_at)}</td>
                  <td>
                    <div className="switch">
                      {u.trial_used > 0 && (
                        <form action={act.resetTrial}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button className="ghost small" type="submit">
                            Reset free
                          </button>
                        </form>
                      )}
                      {u.period_end && (
                        <form action={act.endSubscription}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button className="ghost small" type="submit">
                            End plan
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={10} className="muted">
                    No accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Recent payments</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Email</th>
                <th className="num">Amount</th>
                <th className="num">Fee</th>
                <th>Kind</th>
                <th>Via</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{date(p.paid_at)}</td>
                  <td>{p.email}</td>
                  <td className="num">{rm(p.amount_sen)}</td>
                  <td className="num">{rm(p.fee_sen)}</td>
                  <td>{p.kind}</td>
                  <td>{p.provider}</td>
                  <td>{p.note}</td>
                </tr>
              ))}
              {!payments.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

async function Picks() {
  const r = await picksReport(30);
  type Sug = (typeof r.suggested)[number];
  const byPos = new Map<string, Sug[]>();
  for (const s of r.suggested) byPos.set(s.position, [...(byPos.get(s.position) ?? []), s]);
  const rankTotal = r.pickedRank.reduce((a, b) => a + b.n, 0);
  return (
    <>
      <section className="panel">
        <h2>Last {r.days} days</h2>
        <div className="stat-row">
          <Stat label="Analyses" value={n(r.totals.ok)} />
          <Stat label="Players who marked a pick" value={`${n(r.totals.picked)} (${pct(r.totals.picked, r.totals.ok)})`} />
          <Stat label="Accounts" value={n(r.totals.users)} />
          {[1, 2, 3].map((rank) => (
            <Stat key={rank} label={`Picked option #${rank}`} value={pct(r.pickedRank.find((x) => x.rank === rank)?.n ?? 0, rankTotal)} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Player feedback</h2>
        <div className="stat-row">
          <Stat label="Helpful" value={n(r.feedback.up)} tone={r.feedback.up ? "pos" : undefined} />
          <Stat label="Not helpful" value={n(r.feedback.down)} tone={r.feedback.down ? "neg" : undefined} />
          <Stat label="Helpful rate" value={pct(r.feedback.up, r.feedback.up + r.feedback.down)} />
        </div>
        {r.complaints.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Account</th>
                  <th>Enemy picks</th>
                  <th>Suggested</th>
                  <th>What was wrong</th>
                </tr>
              </thead>
              <tbody>
                {r.complaints.map((c) => (
                  <tr key={c.id}>
                    <td>{dateTime(c.created_at)}</td>
                    <td>{c.email ?? "–"}</td>
                    <td>{(c.draft?.enemy ?? []).join(", ")}</td>
                    <td>{(c.result?.slots ?? []).map((s) => `${POS_LABEL[s.position] ?? s.position}: ${s.options.map((o) => o.hero).join(", ")}`).join(" · ")}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 200 }}>{c.note || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="note">No &quot;not helpful&quot; votes yet.</p>
        )}
      </section>

      <div className="admin-grid">
        {["roam", "marksman", "jungler", "mage", "fighter"].map((pos) => {
          const rows = (byPos.get(pos) ?? []).slice(0, 10);
          return (
            <section key={pos} className="panel">
              <h2>{POS_LABEL[pos]}: suggested</h2>
              {rows.length ? (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Hero</th>
                      <th className="num">Suggested</th>
                      <th className="num">As #1</th>
                      <th className="num">Picked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.hero}>
                        <td>{s.hero}</td>
                        <td className="num">{n(s.times)}</td>
                        <td className="num">{n(s.first)}</td>
                        <td className="num">{n(s.picked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="note">No analyses for this position yet.</p>
              )}
            </section>
          );
        })}
        <section className="panel">
          <h2>Positions asked for</h2>
          <table className="data">
            <tbody>
              {r.open.map((o) => (
                <tr key={o.position}>
                  <td>{POS_LABEL[o.position] ?? o.position}</td>
                  <td className="num">{n(o.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Enemy heroes seen most</h2>
          <table className="data">
            <tbody>
              {r.enemies.map((e) => (
                <tr key={e.hero}>
                  <td>{e.hero}</td>
                  <td className="num">{n(e.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Bans seen most</h2>
          <table className="data">
            <tbody>
              {r.bans.map((e) => (
                <tr key={e.hero}>
                  <td>{e.hero}</td>
                  <td className="num">{n(e.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel">
        <h2>Recent analyses</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Account</th>
                <th>Enemy</th>
                <th>Open</th>
                <th>Suggested</th>
                <th>Picked</th>
              </tr>
            </thead>
            <tbody>
              {r.recent.map((a) => (
                <tr key={a.id}>
                  <td>{dateTime(a.created_at)}</td>
                  <td>{a.email ?? "–"}</td>
                  <td>{(a.draft?.enemy ?? []).join(", ")}</td>
                  <td>{a.open_positions.map((p) => POS_LABEL[p] ?? p).join(", ")}</td>
                  <td>{(a.result?.slots ?? []).map((s) => `${POS_LABEL[s.position] ?? s.position}: ${s.options.map((o) => o.hero).join(" / ")}`).join(" · ")}</td>
                  <td>{a.picked_hero ?? "–"}</td>
                </tr>
              ))}
              {!r.recent.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No analyses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
