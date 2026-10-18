import postgres from "postgres";

// Postgres connection plus an idempotent schema, created on first use.
// Vercel's Neon integration sets DATABASE_URL; Supabase sets POSTGRES_URL.

type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;
let ready: Promise<void> | null = null;

export function databaseUrl(): string {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
}

export function dbConfigured(): boolean {
  return Boolean(databaseUrl());
}

const SCHEMA = `
create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  name text not null default '',
  image text not null default '',
  google_sub text unique,
  trial_used int not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists comp_emails (
  email text primary key,
  note text not null default '',
  added_at timestamptz not null default now()
);
create table if not exists prices (
  id bigserial primary key,
  price_sen int not null check (price_sen > 0),
  effective_from timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists subscriptions (
  id bigserial primary key,
  user_id bigint not null references users(id),
  status text not null,
  plan text not null default 'coach',
  price_sen int not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  provider text not null default 'manual',
  provider_ref text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user on subscriptions(user_id, period_end);
create table if not exists payments (
  id bigserial primary key,
  user_id bigint references users(id),
  email text not null,
  amount_sen int not null,
  fee_sen int not null default 0,
  kind text not null,
  provider text not null default 'manual',
  provider_ref text not null default '',
  note text not null default '',
  paid_at timestamptz not null default now()
);
create table if not exists analyses (
  id bigserial primary key,
  user_id bigint references users(id),
  created_at timestamptz not null default now(),
  status text not null,
  access text not null,
  model text not null default '',
  prompt_tokens int not null default 0,
  cache_hit_tokens int not null default 0,
  completion_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms int not null default 0,
  retried boolean not null default false,
  error_code text not null default '',
  draft jsonb not null default '{}',
  open_positions text[] not null default '{}',
  result jsonb not null default '{}',
  picked_hero text,
  picked_at timestamptz
);
create index if not exists analyses_user_time on analyses(user_id, created_at);
create index if not exists analyses_time on analyses(created_at);
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
`;

function connect(): Sql {
  const url = databaseUrl();
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // prepare:false keeps it working behind connection poolers (Neon, Supabase).
  return postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false, ssl: local ? false : "require" });
}

export async function db(): Promise<Sql> {
  if (!dbConfigured()) throw new Error("DATABASE_URL is not set");
  client ||= connect();
  ready ||= client.unsafe(SCHEMA).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  return client;
}
