import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { ownerEmail } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Privacy · MLBB Draft Coach" };

export default function Privacy() {
  const contact = ownerEmail();
  return (
    <LegalPage title="Privacy policy" updated="18 October 2026">
      <p>MLBB Draft Coach suggests hero picks for Mobile Legends: Bang Bang drafts. This page explains what we collect, why, and your choices.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Google account basics</strong> when you sign in with Google: your name, email address, profile picture and Google account ID. We do not get your
          Google password or access to your Gmail, Drive or contacts.
        </li>
        <li>
          <strong>The drafts you analyze</strong>: the bans and picks you enter, the suggestions we return, and the hero you mark as picked.
        </li>
        <li>
          <strong>Usage records</strong>: when you ran an analysis, how long it took, whether it worked, and your plan (free, trial or paid), so we can enforce limits and
          keep the service running.
        </li>
        <li>
          <strong>Payments</strong>: if you subscribe, the amount, date and payment reference. Card or bank details are handled by the payment provider and are not stored
          by us.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and show your plan and remaining free analyses.</li>
        <li>To produce draft suggestions and to improve them using anonymised totals (for example, which suggested heroes players pick).</li>
        <li>To prevent abuse, apply fair-use limits and handle billing.</li>
      </ul>
      <p>We do not sell your data or use it for advertising.</p>

      <h2>Who processes it</h2>
      <ul>
        <li>Google, for sign-in.</li>
        <li>Vercel (hosting) and Neon (database), which store the data above on our behalf.</li>
        <li>
          DeepSeek, which receives the draft (hero names only) to generate suggestions. Your name and email are never sent to DeepSeek.
        </li>
        <li>A payment provider, if you subscribe.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>We keep your account and analysis history while your account exists. Payment records are kept as long as the law requires for accounting.</p>

      <h2>Your choices</h2>
      <p>
        You can sign out at any time. To see, correct or delete your data, email <a href={`mailto:${contact}`}>{contact}</a> from the address you
        signed in with, and we will reply within 21 days, in line with Malaysia&apos;s Personal Data Protection Act 2010. You can also remove the app&apos;s access in
        your Google account settings.
      </p>

      <h2>Cookies</h2>
      <p>We use one sign-in cookie to keep you signed in and a short-lived cookie during Google sign-in. We do not use advertising or tracking cookies.</p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
    </LegalPage>
  );
}
