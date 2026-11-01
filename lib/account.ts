import { db } from "./db";
import type { User } from "./session";

// Everything stored about one account, for "Download my data" (PDPA right of access).
export async function exportData(user: User) {
  const sql = await db();
  const [profile] = await sql`select email, name, image, trial_used, created_at, last_seen_at from users where id = ${user.id}`;
  const analyses = await sql`
    select created_at, status, draft, open_positions, result, picked_hero, picked_at, feedback, feedback_note, feedback_at
    from analyses where user_id = ${user.id} order by created_at`;
  const subscriptions = await sql`select status, plan, price_sen, period_start, period_end, provider, provider_ref from subscriptions where user_id = ${user.id} order by period_start`;
  const payments = await sql`select amount_sen, kind, provider, provider_ref, note, paid_at from payments where user_id = ${user.id} order by paid_at`;
  const [freeList] = await sql`select note, added_at from comp_emails where email = ${user.email.toLowerCase()}`;
  return { exportedAt: new Date().toISOString(), profile, freeAccess: freeList ?? null, analyses, subscriptions, payments };
}

// Deletes the account. Analyses stay only as anonymous draft statistics (no account, no feedback
// note); payment amounts and dates stay for accounting, without the email. The email also leaves
// the free-access list, so signing in again starts a fresh free account.
export async function deleteAccount(user: User) {
  const sql = await db();
  await sql.begin(async (tx) => {
    await tx`update analyses set user_id = null, feedback_note = '' where user_id = ${user.id}`;
    await tx`update payments set user_id = null, email = 'deleted account' where user_id = ${user.id}`;
    await tx`delete from subscriptions where user_id = ${user.id}`;
    await tx`delete from comp_emails where email = ${user.email.toLowerCase()}`;
    await tx`delete from users where id = ${user.id}`;
  });
}

export async function analysisCount(user: User): Promise<number> {
  const sql = await db();
  const [row] = await sql`select count(*)::int as n from analyses where user_id = ${user.id} and status = 'ok'`;
  return row.n;
}
