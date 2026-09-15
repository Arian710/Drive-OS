-- Phase 2: Trial/Subscription-Grundgeruest + Rate-Limit-Log fuer die Claude-Anbindung.

-- 1) Subscriptions: eine Zeile pro Nutzer, Trial startet automatisch bei Registrierung.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing','active','expired','canceled')),
  trial_started_at timestamptz not null default now(),
  access_until timestamptz not null default (now() + interval '14 days'),
  plan text,
  revenuecat_app_user_id text,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Nutzer duerfen nur ihren eigenen Abo-Status lesen (Schreiben passiert nur privilegiert
-- ueber Service-Role: Signup-Trigger unten, spaeter der RevenueCat-Webhook).
drop policy if exists own_select on public.subscriptions;
create policy own_select on public.subscriptions
  for select using (auth.uid() = user_id);

-- 2) Trial automatisch bei Signup anlegen.
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- Bestehende Nutzer (vor dieser Migration) bekommen ab jetzt ebenfalls 14 Tage Trial.
insert into public.subscriptions (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- 3) Helper-Funktion: hat ein Nutzer aktiven Zugriff (Trial oder Abo)?
-- security definer, damit sie unabhaengig von RLS zuverlaessig auswertet.
create or replace function public.has_active_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id
      and status in ('trialing','active')
      and access_until > now()
  );
$$;

grant execute on function public.has_active_access(uuid) to authenticated;

-- 4) Rate-Limit-Log fuer die Claude-Edge-Function (nur ueber Service-Role beschreibbar/lesbar).
create table if not exists public.ai_usage_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_log_user_created_idx on public.ai_usage_log (user_id, created_at);

alter table public.ai_usage_log enable row level security;
-- Bewusst keine Policies fuer anon/authenticated: nur die Edge Function (Service-Role) darf hier lesen/schreiben.
