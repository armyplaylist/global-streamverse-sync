create table if not exists public.musicat_sync_requests (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  imported_count integer,
  error_message text
);

create index if not exists musicat_sync_requests_status_requested_idx
  on public.musicat_sync_requests(status, requested_at);

create unique index if not exists musicat_sync_requests_one_active_per_participant
  on public.musicat_sync_requests(participant_id)
  where status in ('pending','processing');

alter table public.musicat_sync_requests enable row level security;
grant select on public.musicat_sync_requests to authenticated;
revoke insert on public.musicat_sync_requests from authenticated;
grant insert (participant_id, requested_by)
  on public.musicat_sync_requests to authenticated;

drop policy if exists "Users can view their own Musicat sync requests"
  on public.musicat_sync_requests;
create policy "Users can view their own Musicat sync requests"
on public.musicat_sync_requests for select to authenticated
using (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.participants p
    where p.id = musicat_sync_requests.participant_id
      and p.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can request their own Musicat sync"
  on public.musicat_sync_requests;
create policy "Users can request their own Musicat sync"
on public.musicat_sync_requests for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.participants p
    where p.id = musicat_sync_requests.participant_id
      and p.auth_user_id = (select auth.uid())
      and p.provider = 'musicat'
      and p.status = 'approved'
  )
);

create or replace function public.get_my_stream_profile()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total_streams', (
      select count(*) from public.stream_events e where e.participant_id = p.id
    ),
    'today_streams', (
      select count(*) from public.stream_events e
      where e.participant_id = p.id
        and e.played_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    ),
    'unique_tracks', (
      select count(distinct lower(e.artist || '|' || e.track))
      from public.stream_events e where e.participant_id = p.id
    ),
    'last_capture_at', p.last_synced_at,
    'last_played_at', (
      select max(e.played_at) from public.stream_events e where e.participant_id = p.id
    ),
    'last_recorded_at', (
      select max(e.created_at) from public.stream_events e where e.participant_id = p.id
    ),
    'recent_events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'artist', recent.artist,
          'track', recent.track,
          'played_at', recent.played_at,
          'recorded_at', recent.created_at
        ) order by recent.played_at desc
      )
      from (
        select e.artist, e.track, e.played_at, e.created_at
        from public.stream_events e
        where e.participant_id = p.id
        order by e.played_at desc
        limit 50
      ) recent
    ), '[]'::jsonb)
  )
  from public.participants p
  where p.auth_user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_my_stream_profile() from public, anon;
grant execute on function public.get_my_stream_profile() to authenticated;
