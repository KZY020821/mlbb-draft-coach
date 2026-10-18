import DraftForm from "@/components/DraftForm";
import { getContext, dataAgeDays } from "@/lib/context";
import { passcodeRequired } from "@/lib/guard";
import { accountsEnabled, currentUser } from "@/lib/session";
import { accountFor, type Account } from "@/lib/access";
import AccountBar from "@/components/AccountBar";
import { SiteFooter } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getContext();
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
      <AccountBar accountsOn={accountsOn} account={account} />
      <header className="top">
        <p className="kicker">Mobile Legends: Bang Bang</p>
        <h1>MLBB Draft Coach</h1>
        <p className="lede">
          Enter the bans and picks from your draft. The analysis reads the current patch data and suggests the best last pick or two.
        </p>
        <p className="patch">
          Patch {ctx.meta.patch} · {ctx.meta.season} · Data as of {ctx.meta.dataAsOf}
        </p>
      </header>
      <DraftForm
        heroes={ctx.heroes.map((h) => h.name).sort((a, b) => a.localeCompare(b))}
        passcodeRequired={passcodeRequired()}
        staleDays={dataAgeDays(ctx)}
        accountsOn={accountsOn}
        account={account}
      />
      <SiteFooter />
    </main>
  );
}
