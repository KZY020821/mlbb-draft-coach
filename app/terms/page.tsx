import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { ownerEmail } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Terms · MLBB Draft Coach" };

export default function Terms() {
  const contact = ownerEmail();
  return (
    <LegalPage title="Terms of service" updated="18 October 2026">
      <p>By using MLBB Draft Coach you agree to these terms.</p>

      <h2>The service</h2>
      <p>
        MLBB Draft Coach gives AI-generated hero suggestions for Mobile Legends: Bang Bang drafts, based on patch data and public pro-league results. Suggestions are
        estimates, not guarantees of winning. It is a fan-made tool and is not affiliated with or endorsed by Moonton.
      </p>

      <h2>Accounts</h2>
      <p>Sign in with your own Google account and keep it secure. One person per account; don&apos;t share or resell access.</p>

      <h2>Free analyses and the Coach plan</h2>
      <ul>
        <li>Each new account gets a small number of free analyses.</li>
        <li>
          The Coach plan is a monthly subscription at the price shown on the site. A price change applies from the start of the following month, and we will show it on
          the site before it takes effect.
        </li>
        <li>Paid plans include fair-use limits per day and per month to keep the service fast and affordable for everyone.</li>
        <li>You can cancel at any time; access continues until the end of the period you paid for. Payments are not refunded for partly used periods unless the law requires it.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don&apos;t scrape the service, automate requests, try to get around limits, or attempt to break or overload it. We may suspend accounts that do.</p>

      <h2>Availability</h2>
      <p>We try to keep the coach running but can&apos;t promise it will always be available or error-free. We may change or pause features, for example for maintenance.</p>

      <h2>Liability</h2>
      <p>The service is provided as is. To the extent the law allows, our liability is limited to the amount you paid us in the last month.</p>

      <h2>Changes</h2>
      <p>We may update these terms and will change the date above when we do. Continuing to use the service means you accept the updated terms.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${contact}`}>{contact}</a>
      </p>
    </LegalPage>
  );
}
