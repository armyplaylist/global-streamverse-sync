-- The Spotify sync Edge Function uses the service role to refresh monthly snapshots.
grant execute on function public.refresh_spotify_monthly_rollups() to service_role;
