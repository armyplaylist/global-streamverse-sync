-- MY PURPLE SKY schema for Supabase.
-- Existing pre-auth prototype tables are renamed, not deleted, so their rows remain preserved and hidden.
create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.skies') is not null and to_regclass('public.legacy_skies') is null then alter table public.skies rename to legacy_skies; end if;
  if to_regclass('public.stars') is not null and to_regclass('public.legacy_stars') is null then alter table public.stars rename to legacy_stars; end if;
  if to_regclass('public.legacy_skies') is not null then revoke all on public.legacy_skies from anon, authenticated; end if;
  if to_regclass('public.legacy_stars') is not null then revoke all on public.legacy_stars from anon, authenticated; end if;
end $$;

create table if not exists public.skies (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{4,39}$'),
 display_name text not null default 'MY PURPLE SKY' check (char_length(display_name) between 1 and 60),
 description text not null default '' check (char_length(description) <= 240),
 is_public boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.stars (
 id uuid primary key default gen_random_uuid(),
 sky_id uuid not null references public.skies(id) on delete cascade,
 sender_name text not null check (char_length(sender_name) between 1 and 32),
 dedication text not null check (char_length(dedication) between 1 and 240),
 shape text not null default 'star' check (shape in ('star','diamond','heart','moon','crystal')),
 color text not null default '#b69cff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
 size text not null default 'medium' check (size in ('small','medium','large')),
 effect text not null default 'glow' check (effect in ('glow','sparkle','halo','trail')),
 position_x double precision not null default 0 check (position_x between -20 and 20),
 position_y double precision not null default 0 check (position_y between -20 and 20),
 position_z double precision not null default 0 check (position_z between -20 and 20),
 is_visible boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists stars_sky_created_idx on public.stars(sky_id,created_at desc);
create index if not exists skies_public_created_idx on public.skies(is_public,created_at desc);

alter table public.skies enable row level security;
alter table public.stars enable row level security;

drop policy if exists "Public and owners can read skies" on public.skies;
drop policy if exists "Public can discover skies" on public.skies;
drop policy if exists "Owners can create their sky" on public.skies;
drop policy if exists "Owners can update their sky" on public.skies;
create policy "Public and owners can read skies" on public.skies for select to authenticated using (is_public or (select auth.uid())=owner_id);
create policy "Public can discover skies" on public.skies for select to anon using (is_public);
create policy "Owners can create their sky" on public.skies for insert to authenticated with check ((select auth.uid())=owner_id);
create policy "Owners can update their sky" on public.skies for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

drop policy if exists "Public and owners can read stars" on public.stars;
drop policy if exists "Public can read visible stars" on public.stars;
drop policy if exists "Visitors can leave a star in a public sky" on public.stars;
drop policy if exists "Sky owners can moderate stars" on public.stars;
drop policy if exists "Sky owners can delete stars" on public.stars;
create policy "Public and owners can read stars" on public.stars for select to authenticated using (
 (is_visible and exists(select 1 from public.skies s where s.id=sky_id and s.is_public))
 or exists(select 1 from public.skies s where s.id=sky_id and s.owner_id=(select auth.uid()))
);
create policy "Public can read visible stars" on public.stars for select to anon using (
 is_visible and exists(select 1 from public.skies s where s.id=sky_id and s.is_public)
);
create policy "Visitors can leave a star in a public sky" on public.stars for insert to anon,authenticated with check (
 exists(select 1 from public.skies s where s.id=sky_id and s.is_public)
);
create policy "Sky owners can moderate stars" on public.stars for update to authenticated using (
 exists(select 1 from public.skies s where s.id=sky_id and s.owner_id=(select auth.uid()))
) with check (
 exists(select 1 from public.skies s where s.id=sky_id and s.owner_id=(select auth.uid()))
);
create policy "Sky owners can delete stars" on public.stars for delete to authenticated using (
 exists(select 1 from public.skies s where s.id=sky_id and s.owner_id=(select auth.uid()))
);

grant usage on schema public to anon,authenticated;
grant select,insert on public.skies to anon,authenticated;
grant update on public.skies to authenticated;
grant select,insert on public.stars to anon,authenticated;
grant update,delete on public.stars to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sky-artwork','sky-artwork',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
drop policy if exists "Owners upload sky artwork" on storage.objects;
drop policy if exists "Owners read sky artwork" on storage.objects;
drop policy if exists "Owners update sky artwork" on storage.objects;
drop policy if exists "Owners delete sky artwork" on storage.objects;
create policy "Owners upload sky artwork" on storage.objects for insert to authenticated with check(bucket_id='sky-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owners read sky artwork" on storage.objects for select to authenticated using(bucket_id='sky-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owners update sky artwork" on storage.objects for update to authenticated using(bucket_id='sky-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='sky-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owners delete sky artwork" on storage.objects for delete to authenticated using(bucket_id='sky-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);

do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stars') then
  alter publication supabase_realtime add table public.stars;
 end if;
end $$;

-- Disable the old anonymous token-based SECURITY DEFINER endpoints from the prototype.
revoke execute on function public.create_christmas_sky(text,text) from public,anon,authenticated;
revoke execute on function public.leave_christmas_star(uuid,text,text,text,numeric,numeric,text) from public,anon,authenticated;
