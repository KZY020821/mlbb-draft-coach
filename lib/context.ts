import raw from "@/data/context.json";

export type Hero = {
  name: string;
  roles: string[];
  tier: string;
  lanes?: string[];
  pro?: "ban" | "pick";
  banRate?: number;
  note?: string;
};

export type Context = {
  meta: {
    patch: string;
    season: string;
    patchOpened: string;
    dataAsOf: string;
    sources: string[];
    proPeriod: string;
    unverifiedKits: string[];
  };
  patchNotes: string;
  heroes: Hero[];
};

// Today this reads the bundled snapshot. The planned daily refresh job will
// replace the body of this function with a read from persistent storage, so
// nothing else in the app needs to change.
export async function getContext(): Promise<Context> {
  return raw as unknown as Context;
}

export function dataAgeDays(ctx: Context, now = new Date()): number {
  const asOf = new Date(ctx.meta.dataAsOf + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((now.getTime() - asOf) / 86_400_000));
}
