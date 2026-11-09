-- ReelAI hosted bootstrap: apply ONCE to an empty project in Supabase SQL Editor.
-- Generated from the five repository migrations; no seed data or credentials.
-- Keep supabase/migrations as the source of truth for future schema changes.
begin;

do $reelai_preflight$
begin
  if to_regclass('public.series') is not null
     or to_regclass('public.episodes') is not null
     or to_regclass('public.stream_source_definitions') is not null then
    raise exception 'ReelAI tables already exist. Stop and inspect migration history instead of rerunning bootstrap.';
  end if;
end;
$reelai_preflight$;

-- BEGIN 20260914090000_initial_reelai_schema.sql
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
-- END 20260914090000_initial_reelai_schema.sql

-- BEGIN 20260915090000_catalog_search.sql
create or replace function public.search_series_catalog(
  search_query text default null,
  genre_filter text default null,
  result_limit integer default 50
)
returns table (
  id uuid,
  slug text,
  title text,
  alternative_title text,
  description text,
  poster_url text,
  banner_url text,
  release_year integer,
  status text,
  episode_count integer,
  genres text[],
  tags text[],
  is_ai_original boolean,
  badge text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    series.id,
    series.slug,
    series.title,
    series.alternative_title,
    series.description,
    series.poster_url,
    series.banner_url,
    series.release_year,
    series.status,
    series.episode_count,
    series.genres,
    series.tags,
    series.is_ai_original,
    series.badge
  from public.series
  where series.is_published
    and (
      nullif(btrim(genre_filter), '') is null
      or exists (
        select 1
        from unnest(series.genres) as genre(value)
        where lower(genre.value) = lower(btrim(genre_filter))
      )
    )
    and (
      nullif(btrim(search_query), '') is null
      or position(
        lower(btrim(search_query)) in lower(concat_ws(
          ' ',
          series.title,
          series.alternative_title,
          series.description,
          array_to_string(series.genres, ' '),
          array_to_string(series.tags, ' ')
        ))
      ) > 0
    )
  order by series.trending_rank, series.created_at desc
  limit least(greatest(coalesce(result_limit, 50), 1), 100);
$$;

revoke all on function public.search_series_catalog(text, text, integer) from public;
grant execute on function public.search_series_catalog(text, text, integer) to anon, authenticated;

comment on function public.search_series_catalog(text, text, integer) is
  'Searches the published catalog without transferring all series to the browser. RLS remains enforced because the function uses invoker security.';
-- END 20260915090000_catalog_search.sql

-- BEGIN 20260916090000_external_provider_framework.sql
create table public.stream_source_definitions (
  id uuid primary key default extensions.gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  provider_id text not null,
  external_reference text not null,
  stream_purpose text not null check (stream_purpose in ('watch', 'feed', 'both')),
  priority integer not null default 100 check (priority >= 0),
  is_active boolean not null default true,
  resolution_mode text not null check (resolution_mode in ('static', 'dynamic')),
  static_stream_type text check (static_stream_type is null or static_stream_type in ('mp4', 'hls', 'embed')),
  static_url text,
  capabilities jsonb not null default '{"progressTracking":true,"seek":true,"pictureInPicture":true,"playbackRate":true}'::jsonb,
  allowed_hosts text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_definition_static_fields check (
    (resolution_mode = 'static' and static_stream_type is not null and static_url is not null)
    or (resolution_mode = 'dynamic' and static_stream_type is null and static_url is null)
  ),
  unique (provider_id, episode_id, external_reference, stream_purpose)
);

alter table public.provider_references
add column metadata jsonb not null default '{}'::jsonb;

comment on column public.provider_references.metadata is 'Private non-secret provenance, rights, and attribution metadata for the mapped entity.';

create index stream_source_definitions_resolution_idx
on public.stream_source_definitions(episode_id, stream_purpose, priority)
where is_active;

create table public.external_provider_health (
  provider_id text primary key,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error_type text,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.provider_import_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id text not null,
  external_series_id text not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'dry_run')),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  error_type text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index provider_import_jobs_provider_started_idx
on public.provider_import_jobs(provider_id, started_at desc);

create trigger stream_source_definitions_set_updated_at
before update on public.stream_source_definitions
for each row execute function public.set_updated_at();

create trigger external_provider_health_set_updated_at
before update on public.external_provider_health
for each row execute function public.set_updated_at();

alter table public.stream_source_definitions enable row level security;
alter table public.external_provider_health enable row level security;
alter table public.provider_import_jobs enable row level security;

revoke all on table public.stream_source_definitions, public.external_provider_health, public.provider_import_jobs from anon, authenticated;

comment on table public.stream_source_definitions is 'Private stable source definitions used by the server resolver. Signed playback URLs must never be stored here.';
comment on column public.stream_source_definitions.external_reference is 'Non-secret provider source locator; never credentials, authorization tokens, or signed URLs.';
comment on table public.external_provider_health is 'Private lightweight provider health state used by server-side resolution.';
comment on table public.provider_import_jobs is 'Private operational import history; provider payloads and secrets are intentionally excluded.';

create or replace function public.import_external_catalog(catalog jsonb, publish_content boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_id_value text := nullif(trim(catalog->>'providerId'), '');
  external_series_id_value text := nullif(trim(catalog->>'externalSeriesId'), '');
  series_payload jsonb := catalog->'series';
  episode_payload jsonb;
  source_payload jsonb;
  internal_series_id uuid;
  internal_episode_id uuid;
  requested_slug text;
  resolved_slug text;
  slug_suffix integer := 1;
  created_count integer := 0;
  updated_count integer := 0;
  episode_external_ids text[] := '{}'::text[];
  source_reference text;
begin
  if provider_id_value is null or external_series_id_value is null or series_payload is null then
    raise exception 'invalid external catalog payload' using errcode = '22023';
  end if;
  if jsonb_typeof(catalog->'episodes') <> 'array' then
    raise exception 'episodes must be an array' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(provider_id_value || ':' || external_series_id_value, 0));

  select pr.series_id into internal_series_id
  from public.provider_references as pr
  where pr.provider = provider_id_value
    and pr.entity_type = 'series'
    and pr.external_id = external_series_id_value;

  if internal_series_id is null then
    requested_slug := nullif(trim(series_payload->>'slug'), '');
    if requested_slug is null then
      raise exception 'series slug is required' using errcode = '22023';
    end if;
    resolved_slug := requested_slug;
    while exists (select 1 from public.series where slug = resolved_slug) loop
      slug_suffix := slug_suffix + 1;
      resolved_slug := requested_slug || '-' || slug_suffix::text;
    end loop;

    insert into public.series (
      slug, title, alternative_title, description, poster_url, banner_url,
      release_year, status, episode_count, genres, tags, is_ai_original,
      badge, is_published
    ) values (
      resolved_slug,
      series_payload->>'title',
      nullif(series_payload->>'alternativeTitle', ''),
      coalesce(series_payload->>'description', ''),
      series_payload#>>'{poster,url}',
      nullif(series_payload#>>'{banner,url}', ''),
      nullif(series_payload->>'releaseYear', '')::integer,
      nullif(series_payload->>'status', ''),
      jsonb_array_length(catalog->'episodes'),
      coalesce(array(select jsonb_array_elements_text(series_payload->'genres')), '{}'),
      coalesce(array(select jsonb_array_elements_text(series_payload->'tags')), '{}'),
      coalesce((series_payload->>'isAiOriginal')::boolean, false),
      nullif(series_payload->>'badge', ''),
      publish_content
    ) returning id into internal_series_id;

    insert into public.provider_references(provider, entity_type, series_id, external_id, metadata)
    values (
      provider_id_value,
      'series',
      internal_series_id,
      external_series_id_value,
      jsonb_build_object('poster', series_payload->'poster', 'banner', series_payload->'banner')
    );
    created_count := created_count + 1;
  else
    update public.series set
      title = series_payload->>'title',
      alternative_title = nullif(series_payload->>'alternativeTitle', ''),
      release_year = nullif(series_payload->>'releaseYear', '')::integer,
      status = nullif(series_payload->>'status', ''),
      episode_count = jsonb_array_length(catalog->'episodes'),
      is_published = case when publish_content then true else is_published end
    where id = internal_series_id;
    update public.provider_references set
      metadata = jsonb_build_object('poster', series_payload->'poster', 'banner', series_payload->'banner')
    where provider = provider_id_value and entity_type = 'series' and external_id = external_series_id_value;
    updated_count := updated_count + 1;
  end if;

  for episode_payload in select value from jsonb_array_elements(catalog->'episodes') loop
    if nullif(episode_payload->>'externalId', '') is null or nullif(episode_payload->>'episodeNumber', '') is null then
      raise exception 'episode externalId and episodeNumber are required' using errcode = '22023';
    end if;
    episode_external_ids := array_append(episode_external_ids, episode_payload->>'externalId');

    select pr.episode_id into internal_episode_id
    from public.provider_references as pr
    where pr.provider = provider_id_value
      and pr.entity_type = 'episode'
      and pr.external_id = episode_payload->>'externalId';

    if internal_episode_id is not null and not exists (
      select 1 from public.episodes
      where id = internal_episode_id and series_id = internal_series_id
    ) then
      raise exception 'provider episode mapping belongs to a different series' using errcode = '23514';
    end if;

    if internal_episode_id is null then
      insert into public.episodes (
        series_id, episode_number, title, description, thumbnail_url,
        duration_seconds, release_date, is_published
      ) values (
        internal_series_id,
        (episode_payload->>'episodeNumber')::integer,
        episode_payload->>'title',
        nullif(episode_payload->>'description', ''),
        nullif(episode_payload#>>'{thumbnail,url}', ''),
        nullif(episode_payload->>'durationSeconds', '')::integer,
        nullif(episode_payload->>'releaseDate', '')::date,
        publish_content
      ) returning id into internal_episode_id;

      insert into public.provider_references(provider, entity_type, episode_id, external_id, metadata)
      values (
        provider_id_value,
        'episode',
        internal_episode_id,
        episode_payload->>'externalId',
        jsonb_build_object('thumbnail', episode_payload->'thumbnail')
      );
      created_count := created_count + 1;
    else
      update public.episodes set
        episode_number = (episode_payload->>'episodeNumber')::integer,
        title = episode_payload->>'title',
        duration_seconds = nullif(episode_payload->>'durationSeconds', '')::integer,
        release_date = nullif(episode_payload->>'releaseDate', '')::date,
        is_published = case when publish_content then true else is_published end
      where id = internal_episode_id and series_id = internal_series_id;
      update public.provider_references set
        metadata = jsonb_build_object('thumbnail', episode_payload->'thumbnail')
      where provider = provider_id_value and entity_type = 'episode' and external_id = episode_payload->>'externalId';
      updated_count := updated_count + 1;
    end if;

    for source_payload in select value from jsonb_array_elements(coalesce(episode_payload->'sources', '[]'::jsonb)) loop
      source_reference := coalesce(nullif(source_payload->>'externalReference', ''), 'source:' || (source_payload->>'purpose') || ':' || (source_payload->>'priority'));
      insert into public.stream_source_definitions (
        episode_id, provider_id, external_reference, stream_purpose, priority,
        is_active, resolution_mode, static_stream_type, static_url,
        capabilities, allowed_hosts
      ) values (
        internal_episode_id,
        provider_id_value,
        source_reference,
        source_payload->>'purpose',
        (source_payload->>'priority')::integer,
        true,
        source_payload->>'resolutionMode',
        case when source_payload->>'resolutionMode' = 'static' then source_payload->>'type' else null end,
        case when source_payload->>'resolutionMode' = 'static' then source_payload->>'url' else null end,
        coalesce(source_payload->'capabilities', '{}'::jsonb),
        coalesce(array(select jsonb_array_elements_text(source_payload->'allowedHosts')), '{}')
      )
      on conflict (provider_id, episode_id, external_reference, stream_purpose)
      do update set
        priority = excluded.priority,
        is_active = true,
        resolution_mode = excluded.resolution_mode,
        static_stream_type = excluded.static_stream_type,
        static_url = excluded.static_url,
        capabilities = excluded.capabilities,
        allowed_hosts = excluded.allowed_hosts;
    end loop;
  end loop;

  update public.stream_source_definitions as definitions
  set is_active = false
  where definitions.provider_id = provider_id_value
    and definitions.episode_id in (
      select pr.episode_id
      from public.provider_references as pr
      where pr.provider = provider_id_value
        and pr.entity_type = 'episode'
        and pr.episode_id is not null
    )
    and not exists (
      select 1
      from jsonb_array_elements(catalog->'episodes') as imported_episode(value)
      cross join lateral jsonb_array_elements(coalesce(imported_episode.value->'sources', '[]'::jsonb)) as imported_source(value)
      join public.provider_references as episode_reference
        on episode_reference.provider = provider_id_value
       and episode_reference.entity_type = 'episode'
       and episode_reference.external_id = imported_episode.value->>'externalId'
       and episode_reference.episode_id = definitions.episode_id
      where coalesce(nullif(imported_source.value->>'externalReference', ''), 'source:' || (imported_source.value->>'purpose') || ':' || (imported_source.value->>'priority')) = definitions.external_reference
        and imported_source.value->>'purpose' = definitions.stream_purpose
    );

  update public.episodes as imported_episode
  set is_published = false
  where imported_episode.series_id = internal_series_id
    and exists (
      select 1 from public.provider_references as pr
      where pr.provider = provider_id_value
        and pr.entity_type = 'episode'
        and pr.episode_id = imported_episode.id
        and not (pr.external_id = any(episode_external_ids))
    )
    and not exists (
      select 1 from public.provider_references as alternate
      where alternate.entity_type = 'episode'
        and alternate.episode_id = imported_episode.id
        and alternate.provider <> provider_id_value
    );

  return jsonb_build_object(
    'seriesId', internal_series_id,
    'createdCount', created_count,
    'updatedCount', updated_count,
    'episodeCount', jsonb_array_length(catalog->'episodes')
  );
end;
$$;

revoke all on function public.import_external_catalog(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_external_catalog(jsonb, boolean) to service_role;
-- END 20260916090000_external_provider_framework.sql

-- BEGIN 20260916120000_webm_stream_support.sql
alter table public.stream_sources
drop constraint if exists stream_sources_stream_type_check;

alter table public.stream_sources
add constraint stream_sources_stream_type_check
check (stream_type in ('mp4', 'webm', 'hls', 'embed'));

alter table public.stream_source_definitions
drop constraint if exists stream_source_definitions_static_stream_type_check;

alter table public.stream_source_definitions
add constraint stream_source_definitions_static_stream_type_check
check (static_stream_type is null or static_stream_type in ('mp4', 'webm', 'hls', 'embed'));
-- END 20260916120000_webm_stream_support.sql

-- Record applied versions so subsequent CLI migrations do not replay this setup.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations(version, name, statements) values ('20260914090000', 'initial_reelai_schema', array[]::text[]);
insert into supabase_migrations.schema_migrations(version, name, statements) values ('20260915090000', 'catalog_search', array[]::text[]);
insert into supabase_migrations.schema_migrations(version, name, statements) values ('20260916090000', 'external_provider_framework', array[]::text[]);
insert into supabase_migrations.schema_migrations(version, name, statements) values ('20260916120000', 'webm_stream_support', array[]::text[]);
-- Migration 20261109090000: scope import source retirement.
-- Limit source retirement to the series being synchronized. Importing series B
-- must never disable series A's playback. Existing IDs and privileges are kept.

create or replace function public.import_external_catalog(catalog jsonb, publish_content boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_id_value text := nullif(trim(catalog->>'providerId'), '');
  external_series_id_value text := nullif(trim(catalog->>'externalSeriesId'), '');
  series_payload jsonb := catalog->'series';
  episode_payload jsonb;
  source_payload jsonb;
  internal_series_id uuid;
  internal_episode_id uuid;
  requested_slug text;
  resolved_slug text;
  slug_suffix integer := 1;
  created_count integer := 0;
  updated_count integer := 0;
  episode_external_ids text[] := '{}'::text[];
  source_reference text;
begin
  if provider_id_value is null or external_series_id_value is null or series_payload is null then
    raise exception 'invalid external catalog payload' using errcode = '22023';
  end if;
  if jsonb_typeof(catalog->'episodes') <> 'array' then
    raise exception 'episodes must be an array' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(provider_id_value || ':' || external_series_id_value, 0));

  select pr.series_id into internal_series_id
  from public.provider_references as pr
  where pr.provider = provider_id_value
    and pr.entity_type = 'series'
    and pr.external_id = external_series_id_value;

  if internal_series_id is null then
    requested_slug := nullif(trim(series_payload->>'slug'), '');
    if requested_slug is null then
      raise exception 'series slug is required' using errcode = '22023';
    end if;
    resolved_slug := requested_slug;
    while exists (select 1 from public.series where slug = resolved_slug) loop
      slug_suffix := slug_suffix + 1;
      resolved_slug := requested_slug || '-' || slug_suffix::text;
    end loop;

    insert into public.series (
      slug, title, alternative_title, description, poster_url, banner_url,
      release_year, status, episode_count, genres, tags, is_ai_original,
      badge, is_published
    ) values (
      resolved_slug,
      series_payload->>'title',
      nullif(series_payload->>'alternativeTitle', ''),
      coalesce(series_payload->>'description', ''),
      series_payload#>>'{poster,url}',
      nullif(series_payload#>>'{banner,url}', ''),
      nullif(series_payload->>'releaseYear', '')::integer,
      nullif(series_payload->>'status', ''),
      jsonb_array_length(catalog->'episodes'),
      coalesce(array(select jsonb_array_elements_text(series_payload->'genres')), '{}'),
      coalesce(array(select jsonb_array_elements_text(series_payload->'tags')), '{}'),
      coalesce((series_payload->>'isAiOriginal')::boolean, false),
      nullif(series_payload->>'badge', ''),
      publish_content
    ) returning id into internal_series_id;

    insert into public.provider_references(provider, entity_type, series_id, external_id, metadata)
    values (
      provider_id_value,
      'series',
      internal_series_id,
      external_series_id_value,
      jsonb_build_object('poster', series_payload->'poster', 'banner', series_payload->'banner')
    );
    created_count := created_count + 1;
  else
    update public.series set
      title = series_payload->>'title',
      alternative_title = nullif(series_payload->>'alternativeTitle', ''),
      release_year = nullif(series_payload->>'releaseYear', '')::integer,
      status = nullif(series_payload->>'status', ''),
      episode_count = jsonb_array_length(catalog->'episodes'),
      is_published = case when publish_content then true else is_published end
    where id = internal_series_id;
    update public.provider_references set
      metadata = jsonb_build_object('poster', series_payload->'poster', 'banner', series_payload->'banner')
    where provider = provider_id_value and entity_type = 'series' and external_id = external_series_id_value;
    updated_count := updated_count + 1;
  end if;

  for episode_payload in select value from jsonb_array_elements(catalog->'episodes') loop
    if nullif(episode_payload->>'externalId', '') is null or nullif(episode_payload->>'episodeNumber', '') is null then
      raise exception 'episode externalId and episodeNumber are required' using errcode = '22023';
    end if;
    episode_external_ids := array_append(episode_external_ids, episode_payload->>'externalId');

    select pr.episode_id into internal_episode_id
    from public.provider_references as pr
    where pr.provider = provider_id_value
      and pr.entity_type = 'episode'
      and pr.external_id = episode_payload->>'externalId';

    if internal_episode_id is not null and not exists (
      select 1 from public.episodes
      where id = internal_episode_id and series_id = internal_series_id
    ) then
      raise exception 'provider episode mapping belongs to a different series' using errcode = '23514';
    end if;

    if internal_episode_id is null then
      insert into public.episodes (
        series_id, episode_number, title, description, thumbnail_url,
        duration_seconds, release_date, is_published
      ) values (
        internal_series_id,
        (episode_payload->>'episodeNumber')::integer,
        episode_payload->>'title',
        nullif(episode_payload->>'description', ''),
        nullif(episode_payload#>>'{thumbnail,url}', ''),
        nullif(episode_payload->>'durationSeconds', '')::integer,
        nullif(episode_payload->>'releaseDate', '')::date,
        publish_content
      ) returning id into internal_episode_id;

      insert into public.provider_references(provider, entity_type, episode_id, external_id, metadata)
      values (
        provider_id_value,
        'episode',
        internal_episode_id,
        episode_payload->>'externalId',
        jsonb_build_object('thumbnail', episode_payload->'thumbnail')
      );
      created_count := created_count + 1;
    else
      update public.episodes set
        episode_number = (episode_payload->>'episodeNumber')::integer,
        title = episode_payload->>'title',
        duration_seconds = nullif(episode_payload->>'durationSeconds', '')::integer,
        release_date = nullif(episode_payload->>'releaseDate', '')::date,
        is_published = case when publish_content then true else is_published end
      where id = internal_episode_id and series_id = internal_series_id;
      update public.provider_references set
        metadata = jsonb_build_object('thumbnail', episode_payload->'thumbnail')
      where provider = provider_id_value and entity_type = 'episode' and external_id = episode_payload->>'externalId';
      updated_count := updated_count + 1;
    end if;

    for source_payload in select value from jsonb_array_elements(coalesce(episode_payload->'sources', '[]'::jsonb)) loop
      source_reference := coalesce(nullif(source_payload->>'externalReference', ''), 'source:' || (source_payload->>'purpose') || ':' || (source_payload->>'priority'));
      insert into public.stream_source_definitions (
        episode_id, provider_id, external_reference, stream_purpose, priority,
        is_active, resolution_mode, static_stream_type, static_url,
        capabilities, allowed_hosts
      ) values (
        internal_episode_id,
        provider_id_value,
        source_reference,
        source_payload->>'purpose',
        (source_payload->>'priority')::integer,
        true,
        source_payload->>'resolutionMode',
        case when source_payload->>'resolutionMode' = 'static' then source_payload->>'type' else null end,
        case when source_payload->>'resolutionMode' = 'static' then source_payload->>'url' else null end,
        coalesce(source_payload->'capabilities', '{}'::jsonb),
        coalesce(array(select jsonb_array_elements_text(source_payload->'allowedHosts')), '{}')
      )
      on conflict (provider_id, episode_id, external_reference, stream_purpose)
      do update set
        priority = excluded.priority,
        is_active = true,
        resolution_mode = excluded.resolution_mode,
        static_stream_type = excluded.static_stream_type,
        static_url = excluded.static_url,
        capabilities = excluded.capabilities,
        allowed_hosts = excluded.allowed_hosts;
    end loop;
  end loop;

  update public.stream_source_definitions as definitions
  set is_active = false
  where definitions.provider_id = provider_id_value
    and definitions.episode_id in (
      select pr.episode_id
      from public.provider_references as pr
      where pr.provider = provider_id_value
        and pr.entity_type = 'episode'
        and pr.episode_id is not null
        and exists (
          select 1 from public.episodes as scoped_episode
          where scoped_episode.id = pr.episode_id
            and scoped_episode.series_id = internal_series_id
        )
    )
    and not exists (
      select 1
      from jsonb_array_elements(catalog->'episodes') as imported_episode(value)
      cross join lateral jsonb_array_elements(coalesce(imported_episode.value->'sources', '[]'::jsonb)) as imported_source(value)
      join public.provider_references as episode_reference
        on episode_reference.provider = provider_id_value
       and episode_reference.entity_type = 'episode'
       and episode_reference.external_id = imported_episode.value->>'externalId'
       and episode_reference.episode_id = definitions.episode_id
      where coalesce(nullif(imported_source.value->>'externalReference', ''), 'source:' || (imported_source.value->>'purpose') || ':' || (imported_source.value->>'priority')) = definitions.external_reference
        and imported_source.value->>'purpose' = definitions.stream_purpose
    );

  update public.episodes as imported_episode
  set is_published = false
  where imported_episode.series_id = internal_series_id
    and exists (
      select 1 from public.provider_references as pr
      where pr.provider = provider_id_value
        and pr.entity_type = 'episode'
        and pr.episode_id = imported_episode.id
        and not (pr.external_id = any(episode_external_ids))
    )
    and not exists (
      select 1 from public.provider_references as alternate
      where alternate.entity_type = 'episode'
        and alternate.episode_id = imported_episode.id
        and alternate.provider <> provider_id_value
    );

  return jsonb_build_object(
    'seriesId', internal_series_id,
    'createdCount', created_count,
    'updatedCount', updated_count,
    'episodeCount', jsonb_array_length(catalog->'episodes')
  );
end;
$$;

revoke all on function public.import_external_catalog(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_external_catalog(jsonb, boolean) to service_role;




insert into supabase_migrations.schema_migrations(version, name, statements) values ('20261109090000', 'scope_import_source_retirement', array[]::text[]);
notify pgrst, 'reload schema';
commit;

select tablename from pg_tables where schemaname = 'public' order by tablename;
