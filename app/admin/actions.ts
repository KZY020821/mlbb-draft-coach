"use server";

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser, isOwner } from "@/lib/session";
import { scheduleNextMonthPrice, cancelScheduledPrice } from "@/lib/pricing";
import { updateSettings } from "@/lib/settings";

// Every admin change goes through here. Next.js checks the request Origin for server actions;
// each action also re-checks that the signed-in user is the owner.
async function requireOwner() {
  const user = await currentUser();
  if (!user || !isOwner(user.email)) notFound();
  return user;
}

function back(tab: string, msg: string, err = false): never {
  redirect(`/admin?tab=${tab}&${err ? "err" : "msg"}=${encodeURIComponent(msg)}`);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const ringgit = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export async function setPrice(form: FormData) {
  await requireOwner();
  const sen = ringgit(text(form, "price"));
  if (!Number.isInteger(sen) || sen < 100 || sen > 100000) back("pricing", "Enter a price between RM1 and RM1000.", true);
  const p = await scheduleNextMonthPrice(sen);
  back("pricing", `New price RM${(sen / 100).toFixed(2)} starts ${new Date(p.scheduled!.effectiveFrom).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" })}.`);
}

export async function cancelPrice() {
  await requireOwner();
  await cancelScheduledPrice();
  back("pricing", "Scheduled price change cancelled.");
}

export async function addComp(form: FormData) {
  await requireOwner();
  const email = text(form, "email").toLowerCase();
  if (!EMAIL.test(email)) back("free", "Enter a valid email address.", true);
  const sql = await db();
  await sql`insert into comp_emails (email, note) values (${email}, ${text(form, "note")})
            on conflict (email) do update set note = excluded.note`;
  back("free", `${email} now has free access.`);
}

export async function removeComp(form: FormData) {
  await requireOwner();
  const email = text(form, "email").toLowerCase();
  const sql = await db();
  await sql`delete from comp_emails where email = ${email}`;
  back("free", `${email} removed from the free list.`);
}

export async function saveSettings(form: FormData) {
  await requireOwner();
  const patch: Record<string, unknown> = { aiEnabled: form.get("aiEnabled") === "on" };
  for (const k of ["trialAnalyses", "dailyCap", "monthlyCap", "monthlyBudgetUsd", "usdToMyr", "fixedMonthlyCostRm", "priceInputMissPerM", "priceInputHitPerM", "priceOutputPerM"]) {
    const v = text(form, k);
    if (v !== "") patch[k] = v;
  }
  const r = await updateSettings(patch);
  if (!r.ok) back("usage", r.message, true);
  back("usage", "Settings saved.");
}

// Until online payments are connected: record a payment received another way (bank transfer, DuitNow)
// and give that account the Coach plan for N months.
export async function recordPayment(form: FormData) {
  await requireOwner();
  const email = text(form, "email").toLowerCase();
  const amount = ringgit(text(form, "amount"));
  const fee = ringgit(text(form, "fee") || "0");
  const months = Math.round(Number(text(form, "months") || "1"));
  if (!EMAIL.test(email)) back("users", "Enter the account's email.", true);
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) back("users", "Enter the amount in RM.", true);
  if (!Number.isInteger(fee) || fee < 0 || fee > amount) back("users", "The fee must be between 0 and the amount.", true);
  if (!Number.isInteger(months) || months < 1 || months > 24) back("users", "Months must be 1 to 24.", true);
  const sql = await db();
  const [user] = await sql`select id from users where email = ${email}`;
  if (!user) back("users", `${email} has not signed in yet. Ask them to sign in once first.`, true);
  await sql.begin(async (tx) => {
    const [cur] = await tx`select max(period_end) as end from subscriptions where user_id = ${user.id} and status = 'active' and period_end > now()`;
    const start = cur?.end ? new Date(cur.end) : new Date();
    await tx`insert into subscriptions (user_id, status, price_sen, period_start, period_end, provider, provider_ref)
             values (${user.id}, 'active', ${amount}, ${start}, ${start}::timestamptz + make_interval(months => ${months}), 'manual', ${text(form, "ref")})`;
    await tx`insert into payments (user_id, email, amount_sen, fee_sen, kind, provider, provider_ref, note)
             values (${user.id}, ${email}, ${amount}, ${fee}, 'subscription', 'manual', ${text(form, "ref")}, ${`${months} month(s)`})`;
  });
  back("users", `Recorded RM${(amount / 100).toFixed(2)} from ${email}: Coach plan for ${months} month(s).`);
}

export async function endSubscription(form: FormData) {
  await requireOwner();
  const id = Number(text(form, "userId"));
  if (!Number.isInteger(id)) back("users", "Unknown account.", true);
  const sql = await db();
  await sql`update subscriptions set status = 'cancelled', period_end = least(period_end, now()) where user_id = ${id} and status = 'active' and period_end > now()`;
  back("users", "Coach plan ended for that account.");
}

export async function resetTrial(form: FormData) {
  await requireOwner();
  const id = Number(text(form, "userId"));
  if (!Number.isInteger(id)) back("users", "Unknown account.", true);
  const sql = await db();
  await sql`update users set trial_used = 0 where id = ${id}`;
  back("users", "Free analyses reset for that account.");
}
