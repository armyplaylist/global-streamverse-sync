-- Public profile statistics must never expose private Spotify or scrobble history.
-- Spotify history remains visible only inside the authenticated owner's profile.

create or replace function public.get_public_profile(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
with target as (
  select u.participant_id, u.handle, u.bio, u.avatar_url, u.banner_url,
         p.display_name, p.country_code
  from public.user_profiles u
  join public.participants p on p.id = u.participant_id
  where u.handle = lower(trim(both '@' from p_handle))
    and u.is_public
    and p.status = 'approved'
    and p.consent = true
  limit 1
),
events as (
  select e.played_at, e.track, e.artist, e.album, e.album_cover_url,
         'musicat'::text as source
  from public.stream_events e
  join target t on t.participant_id = e.participant_id
  where e.provider = 'musicat'
),
clock as (
  select (now() at time zone 'UTC')::date as utc_today
),
stats as (
  select count(*)::bigint as total_streams,
         count(*) filter (
           where played_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
         )::bigint as today_streams,
         count(distinct lower(track || '|' || artist))::bigint as unique_tracks,
         max(played_at) as last_played_at
  from events
),
recent as (
  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.played_at desc), '[]'::jsonb
  ) as rows
  from (
    select played_at, track, artist, album, album_cover_url, source
    from events
    order by played_at desc
    limit 50
  ) r
),
daily_counts as (
  select (e.played_at at time zone 'UTC')::date as day,
         count(*)::bigint as streams
  from events e
  cross join clock c
  where e.played_at >= (c.utc_today - 364)::timestamp at time zone 'UTC'
  group by 1
),
daily as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('date', s.day, 'streams', coalesce(d.streams, 0))
      order by s.day
    ), '[]'::jsonb
  ) as rows
  from clock c
  cross join lateral generate_series(
    c.utc_today - 364, c.utc_today, interval '1 day'
  ) s(day)
  left join daily_counts d on d.day = s.day::date
),
top_tracks as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.streams desc, x.last_played_at desc), '[]'::jsonb) as rows
  from (
    select min(track) as track, min(artist) as artist,
           count(*)::bigint as streams, max(played_at) as last_played_at
    from events
    where nullif(trim(track), '') is not null
    group by lower(trim(track)), lower(trim(artist))
    order by count(*) desc, max(played_at) desc
    limit 10
  ) x
),
top_artists as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.streams desc, x.last_played_at desc), '[]'::jsonb) as rows
  from (
    select min(artist) as artist, count(*)::bigint as streams,
           max(played_at) as last_played_at
    from events
    where nullif(trim(artist), '') is not null
    group by lower(trim(artist))
    order by count(*) desc, max(played_at) desc
    limit 10
  ) x
)
select case when exists (select 1 from target) then
  (
    select jsonb_build_object(
      'handle', t.handle,
      'display_name', t.display_name,
      'country_code', t.country_code,
      'bio', t.bio,
      'avatar_url', t.avatar_url,
      'banner_url', t.banner_url,
      'total_streams', s.total_streams,
      'today_streams', s.today_streams,
      'unique_tracks', s.unique_tracks,
      'last_played_at', s.last_played_at,
      'recent_events', r.rows,
      'history', jsonb_build_object(
        'window_days', 365,
        'daily', d.rows,
        'top_tracks', tt.rows,
        'top_artists', ta.rows,
        'methodology', 'Public profile history contains Musicat records only. Daily totals cover the latest 365 UTC days.'
      )
    )
    from target t
    cross join stats s
    cross join recent r
    cross join daily d
    cross join top_tracks tt
    cross join top_artists ta
  )
else null end;
$function$;
