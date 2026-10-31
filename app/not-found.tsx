import type { Metadata } from "next";
import { SiteFooter } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Page not found · MLBB Draft Coach", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="shell">
      <section className="panel status-page">
        <p className="kicker">404</p>
        <h1>Page not found</h1>
        <p className="note">That page doesn&apos;t exist. The draft coach is on the home page.</p>
        <a className="primary status-action" href="/">
          Back to the coach
        </a>
      </section>
      <SiteFooter />
    </main>
  );
}
