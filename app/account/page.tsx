import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { accountsEnabled, currentUser } from "@/lib/session";
import { accountFor } from "@/lib/access";
import { analysisCount } from "@/lib/account";
import { SiteFooter } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account · MLBB Draft Coach", robots: { index: false } };

const PLAN: Record<string, string> = { owner: "Owner", comp: "Free access", subscriber: "Coach plan", trial: "Trial", open: "", free: "Free" };
const date = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" }) : "";

type SP = Promise<{ err?: string }>;

export default async function AccountPage({ searchParams }: { searchParams: SP }) {
  if (!accountsEnabled()) notFound();
  const user = await currentUser();
  if (!user) redirect("/api/auth/google?next=/account");
  const [account, analyses, sp] = await Promise.all([accountFor(user), analysisCount(user), searchParams]);

  return (
    <main className="shell">
      <nav className="account">
        <a className="ghost small" href="/">
          Back to the coach
        </a>
      </nav>
      <header className="top">
        <p className="kicker">MLBB Draft Coach</p>
        <h1>Your account</h1>
      </header>

      <section className="panel">
        <h2>Plan</h2>
        <dl className="facts">
          <dt>Signed in as</dt>
          <dd>{account.email}</dd>
          <dt>Plan</dt>
          <dd>
            {PLAN[account.plan] ?? account.plan}
            {account.periodEnd ? ` until ${date(account.periodEnd)}` : ""}
          </dd>
          {account.plan === "free" && (
            <>
              <dt>Free analyses left</dt>
              <dd>
                {account.trialLeft} of {account.trialTotal}
              </dd>
            </>
          )}
          <dt>Analyses run</dt>
          <dd>{analyses}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <p className="note">Download everything we store about your account: your profile, every draft you analyzed with its suggestions, picks and feedback, and any payments.</p>
        <a className="ghost status-action" href="/api/account/export">
          Download my data
        </a>
      </section>

      <section className="panel danger-zone">
        <h2>Delete account</h2>
        <p className="note">
          This removes your account and signs you out. Your past drafts stay only as anonymous statistics, without your name, email or notes. Payment amounts and
          dates are kept for accounting, without your email. An active Coach plan ends and is not refunded automatically. This can&apos;t be undone.
        </p>
        {sp.err && (
          <p className="error" role="alert">
            {sp.err}
          </p>
        )}
        <form action="/api/account/delete" method="post" className="delete-form">
          <label className="box">
            <span className="box-label">Type DELETE to confirm</span>
            <input type="text" name="confirm" autoComplete="off" spellCheck={false} required />
          </label>
          <button type="submit" className="danger">
            Delete my account
          </button>
        </form>
      </section>
      <SiteFooter />
    </main>
  );
}
