"use client";

// Shown when a page fails to load. The analysis itself reports its own errors on the page.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell">
      <section className="panel status-page">
        <p className="kicker">Something went wrong</p>
        <h1>This page didn&apos;t load</h1>
        <p className="note">It&apos;s probably a short hiccup. Try again, or come back in a minute.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="ghost" href="/">
            Home
          </a>
        </div>
      </section>
    </main>
  );
}
