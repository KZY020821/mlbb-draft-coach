import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { ownerEmail } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Privacy · MLBB Draft Coach" };

export default function Privacy() {
  const contact = ownerEmail();
  return (
    <LegalPage title="Privacy policy" updated="1 November 2026">
      <p>MLBB Draft Coach suggests hero picks for Mobile Legends: Bang Bang drafts. This page explains what we collect, why, and your choices.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Google account basics</strong> when you sign in with Google: your name, email address, profile picture and Google account ID. We do not get your
          Google password or access to your Gmail, Drive or contacts.
        </li>
        <li>
          <strong>The drafts you analyze</strong>: the bans and picks you enter, the pro team you chose to draft like, the suggestions we return, the hero you mark as
          picked, and whether you found the suggestions helpful (with any note you write).
        </li>
        <li>
          <strong>Usage records</strong>: when you ran an analysis, how long it took, whether it worked, and your plan (free, trial or paid), so we can enforce limits and
          keep the service running.
        </li>
        <li>
          <strong>Visit statistics</strong>: pages viewed, loading speed, country, browser and device type, through Vercel Analytics. These use no cookies and are not
          linked to your account.
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
        <li>Vercel (hosting and visit statistics) and Neon (database), which store the data above on our behalf.</li>
        <li>
          DeepSeek, which receives the draft (hero names only) to generate suggestions. Your name and email are never sent to DeepSeek.
        </li>
        <li>A payment provider, if you subscribe.</li>
      </ul>

      <h2>Where it is stored</h2>
      <p>
        Our hosting and database run on servers outside Malaysia, and DeepSeek processes drafts on its own servers, which may be in China. We only use providers that
        protect data under their own published terms, and DeepSeek receives hero names only.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and analysis history while your account exists. When you delete your account, your profile is removed and your past drafts are kept
        only as anonymous statistics, without your name, email or notes. Payment amounts and dates are kept as long as the law requires for accounting, without your
        email.
      </p>

      <h2>Your choices</h2>
      <p>
        On <a href="/account">your account page</a> you can download everything we store about you and delete your account yourself. To correct your data, or if you
        can&apos;t sign in, email <a href={`mailto:${contact}`}>{contact}</a> from the address you signed in with, and we will reply within 21 days, in line with
        Malaysia&apos;s Personal Data Protection Act 2010. You can also sign out at any time and remove the app&apos;s access in your Google account settings.
      </p>

      <h2>Young players</h2>
      <p>If you are under 18, please use the coach with your parent or guardian&apos;s permission, and ask them before paying for a plan.</p>

      <h2>If something goes wrong</h2>
      <p>
        If a data breach affects your personal data, we will tell the Personal Data Protection Commissioner and, where it may harm you, tell you by email, as
        Malaysian law requires.
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
