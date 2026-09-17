create extension if not exists pgcrypto with schema extensions;

create table public.series (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  alternative_title text,
  description text not null default '',
  poster_url text not null,
  banner_url text,
  release_year integer check (release_year between 1900 and 2200),
  status text,
  episode_count integer not null default 0 check (episode_count >= 0),
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  is_ai_original boolean not null default false,
  badge text,
  trending_rank integer not null default 0 check (trending_rank >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.episodes (
  id uuid primary key default extensions.gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text not null,
  description text,
  thumbnail_url text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  release_date date,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, episode_number)
);

create table public.stream_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  provider text not null,
  stream_type text not null check (stream_type in ('mp4', 'hls', 'embed')),
  stream_purpose text not null default 'watch' check (stream_purpose in ('watch', 'feed', 'both')),
  url text not null,
  priority integer not null default 100 check (priority >= 0),
  is_active boolean not null default true,
  is_public boolean not null default false,
  capabilities jsonb not null default '{"progressTracking":true,"seek":true,"pictureInPicture":true,"playbackRate":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_references (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  entity_type text not null check (entity_type in ('series', 'episode')),
  series_id uuid references public.series(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  external_id text not null,
  created_at timestamptz not null default now(),
  constraint provider_reference_target check (
    (entity_type = 'series' and series_id is not null and episode_id is null)
    or (entity_type = 'episode' and episode_id is not null and series_id is null)
  ),
  unique (provider, entity_type, external_id)
);

create unique index provider_references_series_unique on public.provider_references(provider, series_id) where series_id is not null;
create unique index provider_references_episode_unique on public.provider_references(provider, episode_id) where episode_id is not null;
create index series_published_trending_idx on public.series(is_published, trending_rank, created_at desc);
create index episodes_series_number_idx on public.episodes(series_id, episode_number) where is_published;
create index stream_sources_resolution_idx on public.stream_sources(episode_id, stream_purpose, priority) where is_active and is_public;

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create table public.episode_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create table public.watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  position_seconds double precision not null default 0 check (position_seconds >= 0),
  duration_seconds double precision not null default 0 check (duration_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create index watch_history_user_updated_idx on public.watch_history(user_id, updated_at desc);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  autoplay boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger series_set_updated_at before update on public.series for each row execute function public.set_updated_at();
create trigger episodes_set_updated_at before update on public.episodes for each row execute function public.set_updated_at();
create trigger stream_sources_set_updated_at before update on public.stream_sources for each row execute function public.set_updated_at();
create trigger watch_history_set_updated_at before update on public.watch_history for each row execute function public.set_updated_at();
create trigger user_preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

alter table public.series enable row level security;
alter table public.episodes enable row level security;
alter table public.stream_sources enable row level security;
alter table public.provider_references enable row level security;
alter table public.favorites enable row level security;
alter table public.episode_likes enable row level security;
alter table public.watch_history enable row level security;
alter table public.user_preferences enable row level security;

revoke all on table public.series, public.episodes, public.stream_sources, public.provider_references from anon, authenticated;
revoke all on table public.favorites, public.episode_likes, public.watch_history, public.user_preferences from anon, authenticated;

grant select on table public.series, public.episodes, public.stream_sources to anon, authenticated;
grant select, insert, delete on table public.favorites, public.episode_likes to authenticated;
grant select, insert, update, delete on table public.watch_history, public.user_preferences to authenticated;

create policy "Published series are publicly readable"
on public.series for select to anon, authenticated
using (is_published);

create policy "Published episodes are publicly readable"
on public.episodes for select to anon, authenticated
using (
  is_published and exists (
    select 1 from public.series where series.id = episodes.series_id and series.is_published
  )
);

create policy "Public active streams are readable"
on public.stream_sources for select to anon, authenticated
using (
  is_active and is_public and exists (
    select 1
    from public.episodes
    join public.series on series.id = episodes.series_id
    where episodes.id = stream_sources.episode_id
      and episodes.is_published
      and series.is_published
  )
);

create policy "Users can read their favorites"
on public.favorites for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can add their favorites"
on public.favorites for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can remove their favorites"
on public.favorites for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can read their likes"
on public.episode_likes for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can add their likes"
on public.episode_likes for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can remove their likes"
on public.episode_likes for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can read their watch history"
on public.watch_history for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can create their watch history"
on public.watch_history for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can update their watch history"
on public.watch_history for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can delete their watch history"
on public.watch_history for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can read their preferences"
on public.user_preferences for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can create their preferences"
on public.user_preferences for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can update their preferences"
on public.user_preferences for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users can delete their preferences"
on public.user_preferences for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

comment on table public.provider_references is 'Maps ReelAI internal UUIDs to provider-specific identifiers without coupling routes or domain models.';
comment on column public.stream_sources.is_public is 'Only public, non-secret stream URLs may be exposed through the browser Data API.';
