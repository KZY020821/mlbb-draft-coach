import { db } from "./db";

// The Coach plan price. A change always takes effect on the 1st of next month
// (Malaysia time), so people who already paid this month are not affected.
export const DEFAULT_PRICE_SEN = 1500;

export type PriceInfo = {
  currentSen: number;
  scheduled: { priceSen: number; effectiveFrom: string } | null;
};

export async function getPrice(): Promise<PriceInfo> {
  const sql = await db();
  const [current] = await sql`select price_sen from prices where effective_from <= now() order by effective_from desc, id desc limit 1`;
  const [next] = await sql`select price_sen, effective_from from prices where effective_from > now() order by effective_from asc, id desc limit 1`;
  return {
    currentSen: current?.price_sen ?? DEFAULT_PRICE_SEN,
    scheduled: next ? { priceSen: next.price_sen, effectiveFrom: new Date(next.effective_from).toISOString() } : null
  };
}

// Replaces any pending change with a new price starting next month.
export async function scheduleNextMonthPrice(priceSen: number): Promise<PriceInfo> {
  const sql = await db();
  await sql.begin(async (tx) => {
    await tx`delete from prices where effective_from > now()`;
    await tx`insert into prices (price_sen, effective_from)
             values (${priceSen}, (date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur') + interval '1 month') at time zone 'Asia/Kuala_Lumpur')`;
  });
  return getPrice();
}

export async function cancelScheduledPrice(): Promise<PriceInfo> {
  const sql = await db();
  await sql`delete from prices where effective_from > now()`;
  return getPrice();
}

export const rm = (sen: number) => `${sen < 0 ? "−" : ""}RM${(Math.abs(sen) / 100).toFixed(2).replace(/\.00$/, "")}`;
