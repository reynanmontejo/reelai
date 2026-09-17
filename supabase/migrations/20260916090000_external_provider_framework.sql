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
