grant select on public.stream_events to authenticated;

drop policy if exists "Participants can view their own stream events" on public.stream_events;
create policy "Participants can view their own stream events"
on public.stream_events
for select
to authenticated
using (
  exists (
    select 1
    from public.participants p
    where p.id = stream_events.participant_id
      and p.auth_user_id = (select auth.uid())
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
      select count(*) from public.stream_events e
      where e.participant_id = p.id
    ),
    'today_streams', (
      select count(*) from public.stream_events e
      where e.participant_id = p.id
        and e.played_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    ),
    'unique_tracks', (
      select count(distinct lower(e.artist || '|' || e.track))
      from public.stream_events e
      where e.participant_id = p.id
    ),
    'recent_events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'artist', recent.artist,
          'track', recent.track,
          'played_at', recent.played_at
        ) order by recent.played_at desc
      )
      from (
        select e.artist, e.track, e.played_at
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
