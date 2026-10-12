import DraftForm from "@/components/DraftForm";
import { getContext, dataAgeDays } from "@/lib/context";
import { passcodeRequired } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getContext();
  return (
    <main className="shell">
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
      />
    </main>
  );
}
