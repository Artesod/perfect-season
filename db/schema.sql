-- Perfect Season — Supabase schema
-- Apply in the Supabase SQL editor (or `supabase db push` if using the CLI).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, display name shown on leaderboards.
-- Created automatically by trigger when a user signs up (Google OAuth).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile on signup, using the Google name when available.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Player'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- meta_progress: one row per user, mirrors the client MetaProgress shape.
-- The client merges local + cloud (max counters, union badges) and upserts.
-- ---------------------------------------------------------------------------
create table if not exists public.meta_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_runs integer not null default 0 check (total_runs >= 0),
  runs_won integer not null default 0 check (runs_won >= 0),
  best_wins integer not null default 0 check (best_wins between 0 and 82),
  highest_ascension_beaten integer not null default -1
    check (highest_ascension_beaten between -1 and 20),
  badges text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.meta_progress enable row level security;

drop policy if exists "users read own meta" on public.meta_progress;
create policy "users read own meta"
  on public.meta_progress for select using (auth.uid() = user_id);

drop policy if exists "users insert own meta" on public.meta_progress;
create policy "users insert own meta"
  on public.meta_progress for insert with check (auth.uid() = user_id);

drop policy if exists "users update own meta" on public.meta_progress;
create policy "users update own meta"
  on public.meta_progress for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- runs: one row per finished run. Stores seed + ascension + dataset version
-- so any entry can be re-verified server-side later (seeded determinism).
-- Client-submitted for now; see ROADMAP decisions log.
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  seed bigint not null,
  ascension integer not null check (ascension between 0 and 20),
  wins integer not null check (wins between 0 and 82),
  losses integer not null check (losses >= 0),
  won boolean not null,
  -- NbaDataset.fetchedAt for real-player runs, null for procedural runs.
  dataset_version text,
  created_at timestamptz not null default now()
);

create index if not exists runs_leaderboard_idx
  on public.runs (wins desc, ascension desc, created_at asc);
create index if not exists runs_user_idx on public.runs (user_id, created_at desc);

alter table public.runs enable row level security;

drop policy if exists "runs are publicly readable" on public.runs;
create policy "runs are publicly readable"
  on public.runs for select using (true);

drop policy if exists "users insert own runs" on public.runs;
create policy "users insert own runs"
  on public.runs for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- leaderboard: best runs with display names. security_invoker keeps RLS of
-- the querying user (both tables are publicly readable anyway).
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard
  with (security_invoker = true) as
select
  r.id,
  r.user_id,
  p.display_name,
  r.seed,
  r.ascension,
  r.wins,
  r.losses,
  r.won,
  r.dataset_version,
  r.created_at
from public.runs r
join public.profiles p on p.id = r.user_id;
