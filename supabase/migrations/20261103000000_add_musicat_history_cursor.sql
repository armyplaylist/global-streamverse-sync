alter table public.participants
add column if not exists history_cursor_at timestamptz;

comment on column public.participants.history_cursor_at is
'Oldest Musicat history timestamp reached during an incomplete initial backfill; cleared after the integration timestamp is reached.';
