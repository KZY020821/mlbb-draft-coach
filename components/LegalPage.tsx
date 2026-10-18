import type { ReactNode } from "react";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="shell legal">
      <nav className="account">
        <a className="ghost small" href="/">
          Back to the coach
        </a>
      </nav>
      <header className="top">
        <p className="kicker">MLBB Draft Coach</p>
        <h1>{title}</h1>
        <p className="note">Last updated {updated}</p>
      </header>
      <section className="panel prose">{children}</section>
      <SiteFooter />
    </main>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <span>MLBB Draft Coach is a fan-made tool and is not affiliated with Moonton.</span>
    </footer>
  );
}
