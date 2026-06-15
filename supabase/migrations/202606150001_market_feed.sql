create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.market_collector_config (
  singleton boolean primary key default true check (singleton),
  collector_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

insert into private.market_collector_config (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.market_snapshots (
  id bigint generated always as identity primary key,
  league text not null,
  captured_at timestamptz not null,
  fingerprint text not null,
  items jsonb not null,
  item_count integer not null check (item_count >= 0),
  created_at timestamptz not null default now(),
  unique (league, captured_at)
);

create index if not exists market_snapshots_league_captured_idx
  on public.market_snapshots (league, captured_at desc);

create table if not exists public.market_boards (
  league text not null,
  period text not null check (period in ('30m', '1d', '7d')),
  payload jsonb not null,
  generated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (league, period)
);

create index if not exists market_boards_generated_idx
  on public.market_boards (generated_at desc);

create table if not exists public.market_collector_state (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'idle',
  detail text,
  constraint market_collector_state_status_check
    check (status in ('idle', 'running', 'success', 'error'))
);

insert into public.market_collector_state (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.market_snapshots enable row level security;
alter table public.market_boards enable row level security;
alter table public.market_collector_state enable row level security;

revoke all on public.market_snapshots from anon, authenticated;
revoke all on public.market_boards from anon, authenticated;
revoke all on public.market_collector_state from anon, authenticated;

create or replace function public.try_start_market_collection(minimum_interval interval default interval '10 minutes')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean;
  last_started timestamptz;
begin
  acquired := pg_try_advisory_xact_lock(hashtext('reliquary-market-collector'));
  if not acquired then
    return false;
  end if;

  select started_at into last_started
  from public.market_collector_state
  where singleton = true
  for update;

  if last_started is not null and last_started > now() - minimum_interval then
    return false;
  end if;

  update public.market_collector_state
  set started_at = now(), status = 'running', detail = null
  where singleton = true;
  return true;
end;
$$;

create or replace function public.authorize_market_collector(candidate text)
returns boolean
language sql
security definer
stable
set search_path = private, public
as $$
  select candidate is not null and candidate = collector_secret
  from private.market_collector_config
  where singleton = true;
$$;

create or replace function public.finish_market_collection(result_status text, result_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if result_status not in ('success', 'error') then
    raise exception 'invalid collector status: %', result_status;
  end if;

  update public.market_collector_state
  set completed_at = now(), status = result_status, detail = left(result_detail, 2000)
  where singleton = true;
end;
$$;

create or replace function public.prune_market_snapshots(retention interval default interval '8 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.market_snapshots where captured_at < now() - retention;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.try_start_market_collection(interval) from public, anon, authenticated;
revoke all on function public.authorize_market_collector(text) from public, anon, authenticated;
revoke all on function public.finish_market_collection(text, text) from public, anon, authenticated;
revoke all on function public.prune_market_snapshots(interval) from public, anon, authenticated;
grant execute on function public.try_start_market_collection(interval) to service_role;
grant execute on function public.authorize_market_collector(text) to service_role;
grant execute on function public.finish_market_collection(text, text) to service_role;
grant execute on function public.prune_market_snapshots(interval) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'reliquary-market-collector';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'reliquary-market-collector',
  '3,33 * * * *',
  $collector$
    select net.http_post(
      url := 'https://tzxclvrmmptvqhzobgse.supabase.co/functions/v1/collect-market',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-collector-secret', (
          select collector_secret
          from private.market_collector_config
          where singleton = true
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $collector$
);
