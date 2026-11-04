-- GLOBAL STREAMVERSE: monthly Spotify rollups.
-- Reuses spotify_listening_events; never deletes source listening history.
create table if not exists public.spotify_monthly_track_stats (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  spotify_track_id text not null,
  track text not null,
  artist text not null,
  album text,
  play_count integer not null default 0 check (play_count >= 0),
  primary key (auth_user_id, month_start, spotify_track_id)
);
create table if not exists public.spotify_monthly_artist_stats (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  artist text not null,
  play_count integer not null default 0 check (play_count >= 0),
  primary key (auth_user_id, month_start, artist)
);
create table if not exists public.spotify_monthly_stats (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  total_scrobbles integer not null default 0 check (total_scrobbles >= 0),
  unique_artist_credits integer not null default 0 check (unique_artist_credits >= 0),
  unique_tracks integer not null default 0 check (unique_tracks >= 0),
  primary key (auth_user_id, month_start)
);
create index if not exists spotify_monthly_track_rank_idx
  on public.spotify_monthly_track_stats (auth_user_id, month_start desc, play_count desc);
create index if not exists spotify_monthly_artist_rank_idx
  on public.spotify_monthly_artist_stats (auth_user_id, month_start desc, play_count desc);
alter table public.spotify_monthly_track_stats enable row level security;
alter table public.spotify_monthly_artist_stats enable row level security;
alter table public.spotify_monthly_stats enable row level security;
drop policy if exists "Users can read their own Spotify monthly tracks" on public.spotify_monthly_track_stats;
create policy "Users can read their own Spotify monthly tracks"
  on public.spotify_monthly_track_stats for select to authenticated
  using (auth_user_id = (select auth.uid()));
drop policy if exists "Users can read their own Spotify monthly artists" on public.spotify_monthly_artist_stats;
create policy "Users can read their own Spotify monthly artists"
  on public.spotify_monthly_artist_stats for select to authenticated
  using (auth_user_id = (select auth.uid()));
drop policy if exists "Users can read their own Spotify monthly stats" on public.spotify_monthly_stats;
create policy "Users can read their own Spotify monthly stats"
  on public.spotify_monthly_stats for select to authenticated
  using (auth_user_id = (select auth.uid()));
grant select on public.spotify_monthly_track_stats to authenticated;
grant select on public.spotify_monthly_artist_stats to authenticated;
grant select on public.spotify_monthly_stats to authenticated;
create or replace function public.refresh_spotify_monthly_rollups()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.spotify_monthly_track_stats
    (auth_user_id, month_start, spotify_track_id, track, artist, album, play_count)
  select auth_user_id, date_trunc('month', played_at at time zone 'UTC')::date,
    spotify_track_id, max(track), max(artist), max(album), count(*)::integer
  from public.spotify_listening_events
  group by auth_user_id, date_trunc('month', played_at at time zone 'UTC')::date, spotify_track_id
  on conflict (auth_user_id, month_start, spotify_track_id)
  do update set track=excluded.track, artist=excluded.artist, album=excluded.album, play_count=excluded.play_count;

  insert into public.spotify_monthly_artist_stats (auth_user_id, month_start, artist, play_count)
  select auth_user_id, date_trunc('month', played_at at time zone 'UTC')::date, artist, count(*)::integer
  from public.spotify_listening_events
  group by auth_user_id, date_trunc('month', played_at at time zone 'UTC')::date, artist
  on conflict (auth_user_id, month_start, artist)
  do update set play_count=excluded.play_count;

  insert into public.spotify_monthly_stats
    (auth_user_id, month_start, total_scrobbles, unique_artist_credits, unique_tracks)
  select auth_user_id, date_trunc('month', played_at at time zone 'UTC')::date,
    count(*)::integer, count(distinct artist)::integer, count(distinct spotify_track_id)::integer
  from public.spotify_listening_events
  group by auth_user_id, date_trunc('month', played_at at time zone 'UTC')::date
  on conflict (auth_user_id, month_start)
  do update set total_scrobbles=excluded.total_scrobbles,
    unique_artist_credits=excluded.unique_artist_credits, unique_tracks=excluded.unique_tracks;
end;
$$;
revoke all on function public.refresh_spotify_monthly_rollups() from public, anon, authenticated;

create or replace function public.get_my_spotify_monthly_stats()
returns jsonb language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month_start',month_start,'total_scrobbles',total_scrobbles,
        'unique_artist_credits',unique_artist_credits,'unique_tracks',unique_tracks) order by month_start desc)
      from (select month_start,total_scrobbles,unique_artist_credits,unique_tracks
        from public.spotify_monthly_stats where auth_user_id=(select auth.uid())
        order by month_start desc limit 12) m
    ), '[]'::jsonb),
    'top_tracks', coalesce((
      select jsonb_agg(jsonb_build_object('spotify_track_id',spotify_track_id,'track',track,
        'artist',artist,'album',album,'play_count',play_count) order by play_count desc,track asc)
      from (select spotify_track_id,track,artist,album,play_count
        from public.spotify_monthly_track_stats where auth_user_id=(select auth.uid())
          and month_start=date_trunc('month',now() at time zone 'UTC')::date
        order by play_count desc,track asc limit 10) t
    ), '[]'::jsonb),
    'top_artists', coalesce((
      select jsonb_agg(jsonb_build_object('artist',artist,'play_count',play_count)
        order by play_count desc,artist asc)
      from (select artist,play_count from public.spotify_monthly_artist_stats
        where auth_user_id=(select auth.uid())
          and month_start=date_trunc('month',now() at time zone 'UTC')::date
        order by play_count desc,artist asc limit 10) a
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.get_my_spotify_monthly_stats() to authenticated;
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname='spotify-monthly-rollups';
  perform cron.schedule('spotify-monthly-rollups','15 3 * * *',
    'select public.refresh_spotify_monthly_rollups();');
end;
$$;
select public.refresh_spotify_monthly_rollups();
