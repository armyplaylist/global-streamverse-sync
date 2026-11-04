CREATE OR REPLACE FUNCTION public.get_public_profile(p_handle text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with target as (
  select u.auth_user_id, u.participant_id, u.handle, u.bio, u.avatar_url, u.banner_url, u.is_public,
         p.display_name, p.country_code, p.status
  from public.user_profiles u
  join public.participants p on p.id = u.participant_id
  where u.handle = lower(trim(both '@' from p_handle))
    and u.is_public and p.status = 'approved' and p.consent = true
  limit 1
),
events as (
  select e.played_at, e.track, e.artist, e.album, e.album_cover_url, 'musicat'::text as source
  from public.stream_events e join target t on t.participant_id = e.participant_id
  union all
  select e.played_at, e.track, e.artist, e.album, e.album_cover_url, 'spotify'::text
  from public.spotify_listening_events e join target t on t.auth_user_id = e.auth_user_id
  union all
  select e.played_at, e.track, e.artist, e.album, e.album_cover_url, e.source
  from public.scrobble_events e join target t on t.auth_user_id = e.auth_user_id
),
stats as (
  select count(*)::bigint total_streams,
         count(*) filter (where played_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::bigint today_streams,
         count(distinct lower(track || '|' || artist))::bigint unique_tracks,
         max(played_at) last_played_at
  from events
),
recent as (
  select coalesce(jsonb_agg(to_jsonb(r) order by r.played_at desc), '[]'::jsonb) rows
  from (select played_at, track, artist, album, album_cover_url, source from events order by played_at desc limit 50) r
),
daily_counts as (
  select (played_at at time zone 'utc')::date as day, count(*)::bigint as streams
  from events
  where played_at >= (current_date - 364)::timestamp at time zone 'utc'
  group by 1
),
daily as (
  select coalesce(jsonb_agg(jsonb_build_object('date', s.day, 'streams', coalesce(d.streams, 0)) order by s.day), '[]'::jsonb) rows
  from generate_series(current_date - 364, current_date, interval '1 day') s(day)
  left join daily_counts d on d.day = s.day::date
),
top_tracks as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.streams desc, x.last_played_at desc), '[]'::jsonb) rows
  from (
    select min(track) as track, min(artist) as artist, count(*)::bigint as streams, max(played_at) as last_played_at
    from events where nullif(trim(track), '') is not null
    group by lower(trim(track)), lower(trim(artist))
    order by count(*) desc, max(played_at) desc
    limit 10
  ) x
),
top_artists as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.streams desc, x.last_played_at desc), '[]'::jsonb) rows
  from (
    select min(artist) as artist, count(*)::bigint as streams, max(played_at) as last_played_at
    from events where nullif(trim(artist), '') is not null
    group by lower(trim(artist))
    order by count(*) desc, max(played_at) desc
    limit 10
  ) x
)
select case when exists(select 1 from target) then
  (select jsonb_build_object(
    'handle', t.handle, 'display_name', t.display_name, 'country_code', t.country_code,
    'bio', t.bio, 'avatar_url', t.avatar_url, 'banner_url', t.banner_url,
    'total_streams', s.total_streams, 'today_streams', s.today_streams,
    'unique_tracks', s.unique_tracks, 'last_played_at', s.last_played_at,
    'recent_events', r.rows,
    'history', jsonb_build_object(
      'window_days', 365,
      'daily', d.rows,
      'top_tracks', tt.rows,
      'top_artists', ta.rows,
      'methodology', 'Daily totals cover the latest 365 UTC days; lifetime track and artist rankings use all recorded sources.'
    )
  ) from target t cross join stats s cross join recent r cross join daily d cross join top_tracks tt cross join top_artists ta)
else null end;
$function$


CREATE OR REPLACE FUNCTION public.get_my_stream_profile()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with me as (
  select p.id, p.last_synced_at
  from public.participants p
  where p.auth_user_id = (select auth.uid())
  limit 1
),
events as (
  select e.artist, e.track, e.played_at, e.created_at
  from public.stream_events e join me p on p.id = e.participant_id
),
stats as (
  select count(*)::bigint total_streams,
         count(*) filter (where played_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::bigint today_streams,
         count(distinct lower(artist || '|' || track))::bigint unique_tracks,
         max(played_at) last_played_at,
         max(created_at) last_recorded_at
  from events
),
recent as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'artist', r.artist, 'track', r.track, 'played_at', r.played_at, 'recorded_at', r.created_at
  ) order by r.played_at desc), '[]'::jsonb) rows
  from (select * from events order by played_at desc limit 50) r
),
daily_counts as (
  select (played_at at time zone 'utc')::date as day, count(*)::bigint as streams
  from events
  where played_at >= (current_date - 364)::timestamp at time zone 'utc'
  group by 1
),
daily as (
  select coalesce(jsonb_agg(jsonb_build_object('date', s.day, 'streams', coalesce(d.streams, 0)) order by s.day), '[]'::jsonb) rows
  from generate_series(current_date - 364, current_date, interval '1 day') s(day)
  left join daily_counts d on d.day = s.day::date
),
top_tracks as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.streams desc, x.last_played_at desc), '[]'::jsonb) rows
  from (
    select min(track) as track, min(artist) as artist, count(*)::bigint as streams, max(played_at) as last_played_at
    from events where nullif(trim(track), '') is not null
    group by lower(trim(track)), lower(trim(artist))
    order by count(*) desc, max(played_at) desc
    limit 10
  ) x
),
top_artists as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.streams desc, x.last_played_at desc), '[]'::jsonb) rows
  from (
    select min(artist) as artist, count(*)::bigint as streams, max(played_at) as last_played_at
    from events where nullif(trim(artist), '') is not null
    group by lower(trim(artist))
    order by count(*) desc, max(played_at) desc
    limit 10
  ) x
)
select case when exists(select 1 from me) then
  (select jsonb_build_object(
    'total_streams', s.total_streams, 'today_streams', s.today_streams,
    'unique_tracks', s.unique_tracks, 'last_capture_at', me.last_synced_at,
    'last_played_at', s.last_played_at, 'last_recorded_at', s.last_recorded_at,
    'recent_events', r.rows,
    'history', jsonb_build_object(
      'window_days', 365, 'daily', d.rows,
      'top_tracks', tt.rows, 'top_artists', ta.rows,
      'methodology', 'Musicat history only; daily totals cover the latest 365 UTC days and rankings use all recorded Musicat events.'
    )
  ) from me cross join stats s cross join recent r cross join daily d cross join top_tracks tt cross join top_artists ta)
else null end;
$function$
