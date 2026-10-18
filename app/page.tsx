import DraftForm from "@/components/DraftForm";
import { getContext, dataAgeDays } from "@/lib/context";
import { passcodeRequired } from "@/lib/guard";
import { accountsEnabled, currentUser } from "@/lib/session";
import { accountFor, type Account } from "@/lib/access";
import AccountBar from "@/components/AccountBar";
import { SiteFooter } from "@/components/LegalPage";
import { teamChoices } from "@/lib/meta";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getContext();
  const { leagues, teams } = teamChoices();
  const accountsOn = accountsEnabled();
  let account: Account | null = null;
  if (accountsOn) {
    try {
      const user = await currentUser();
      if (user) account = await accountFor(user);
    } catch (e) {
      console.error("[home] account lookup failed", e);
    }
  }
  return (
    <main className="shell">
      <div className="topbar">
        <a className="brand" href="/">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <span>MLBB Draft Coach</span>
        </a>
        <AccountBar accountsOn={accountsOn} account={account} />
      </div>
      <header className="hero">
        <p className="kicker">Mobile Legends: Bang Bang · Draft assistant</p>
        <h1>
          Lock in the <span className="grad">right last pick.</span>
        </h1>
        <p className="lede">
          Enter the bans and picks from your draft. The coach reads the current patch and MPL Indonesia, Philippines and Malaysia drafts, and
          suggests three heroes for each open position.
        </p>
        <ul className="hero-meta" aria-label="Data">
          <li>Patch {ctx.meta.patch}</li>
          <li>{ctx.meta.season}</li>
          <li>Data as of {ctx.meta.dataAsOf}</li>
        </ul>
      </header>
      <DraftForm
        heroes={ctx.heroes.map((h) => h.name).sort((a, b) => a.localeCompare(b))}
        passcodeRequired={passcodeRequired()}
        staleDays={dataAgeDays(ctx)}
        accountsOn={accountsOn}
        account={account}
        leagues={leagues}
        teams={teams}
      />
      <SiteFooter />
    </main>
  );
}
