import type { Account } from "@/lib/access";

const PLAN: Record<Account["plan"], string> = {
  owner: "Owner",
  comp: "Free access",
  subscriber: "Coach",
  trial: "Trial",
  open: "",
  free: "Free"
};

// Server-rendered: sign-in link, or avatar, plan badge and sign-out.
export default function AccountBar({ accountsOn, account }: { accountsOn: boolean; account: Account | null }) {
  if (!accountsOn) return null;
  if (!account) {
    return (
      <nav className="account">
        <a className="ghost small" href="/api/auth/google">
          Sign in with Google
        </a>
      </nav>
    );
  }
  return (
    <nav className="account">
      {account.image ? <img className="avatar" src={account.image} alt="" width={28} height={28} referrerPolicy="no-referrer" /> : null}
      <span className="who">{account.name || account.email}</span>
      <span className={`badge badge-${account.plan}`}>{PLAN[account.plan]}</span>
      {account.plan === "owner" && (
        <a className="ghost small" href="/admin">
          Admin
        </a>
      )}
      <form action="/api/auth/logout" method="post">
        <button className="ghost small" type="submit">
          Sign out
        </button>
      </form>
    </nav>
  );
}
