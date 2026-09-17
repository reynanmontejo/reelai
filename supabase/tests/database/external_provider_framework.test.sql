begin;
select plan(23);

select has_table('public', 'stream_source_definitions', 'private stream source definitions table exists');
select has_table('public', 'external_provider_health', 'provider health table exists');
select has_table('public', 'provider_import_jobs', 'provider import jobs table exists');
select has_function('public', 'import_external_catalog', array['jsonb', 'boolean'], 'atomic external catalog import function exists');

select ok((select relrowsecurity from pg_class where oid = 'public.stream_source_definitions'::regclass), 'source definitions use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.external_provider_health'::regclass), 'provider health uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.provider_import_jobs'::regclass), 'import jobs use RLS');

select is(
  (select count(*)::integer from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_schema = 'public' and table_name in ('stream_source_definitions', 'external_provider_health', 'provider_import_jobs')),
  0,
  'browser roles have no private provider table grants'
);
select ok(not has_function_privilege('anon', 'public.import_external_catalog(jsonb,boolean)', 'execute'), 'anonymous cannot execute catalog imports');
select ok(not has_function_privilege('authenticated', 'public.import_external_catalog(jsonb,boolean)', 'execute'), 'authenticated users cannot execute catalog imports');
select ok(has_function_privilege('service_role', 'public.import_external_catalog(jsonb,boolean)', 'execute'), 'service role may execute catalog imports');

create temporary table first_import_result as
select public.import_external_catalog(
  '{
    "providerId":"test-provider",
    "externalSeriesId":"external-series-1",
    "series":{"slug":"phase7-imported","title":"Imported Series","description":"Initial description","poster":{"url":"/images/poster-1.svg"},"genres":["Drama"],"tags":["Test"]},
    "episodes":[
      {"externalId":"external-episode-1","episodeNumber":1,"title":"Episode One","sources":[{"externalReference":"watch-main","purpose":"watch","priority":0,"resolutionMode":"dynamic","capabilities":{"progressTracking":true,"seek":true,"pictureInPicture":true,"playbackRate":true},"allowedHosts":["media.example.test"]}]},
      {"externalId":"external-episode-2","episodeNumber":2,"title":"Episode Two","sources":[{"externalReference":"feed-main","purpose":"feed","priority":10,"resolutionMode":"dynamic","capabilities":{"progressTracking":true,"seek":true,"pictureInPicture":false,"playbackRate":true},"allowedHosts":["media.example.test"]}]}
    ]
  }'::jsonb,
  true
) as result;

select is((select (result->>'createdCount')::integer from first_import_result), 3, 'first import creates one series and two episodes');
select is((select count(*)::integer from public.series where slug = 'phase7-imported'), 1, 'import creates one internal series');
select is((select count(*)::integer from public.provider_references where provider = 'test-provider'), 3, 'import creates stable series and episode mappings');
select is((select count(*)::integer from public.stream_source_definitions where provider_id = 'test-provider'), 2, 'import creates source definitions');

select lives_ok(
  $$insert into public.stream_source_definitions (
      episode_id, provider_id, external_reference, stream_purpose, priority,
      resolution_mode, static_stream_type, static_url
    )
    select episode_id, 'test-provider', 'webm-static', 'both', 20,
      'static', 'webm', 'https://media.example.test/video.webm'
    from public.provider_references
    where provider = 'test-provider' and external_id = 'external-episode-1'$$,
  'source definitions accept native WebM streams'
);

select public.import_external_catalog(
  '{
    "providerId":"test-provider",
    "externalSeriesId":"external-series-1",
    "series":{"slug":"phase7-imported","title":"Imported Series Updated","description":"provider overwrite attempt","poster":{"url":"/images/poster-2.svg"},"genres":["Mystery"],"tags":[]},
    "episodes":[
      {"externalId":"external-episode-1","episodeNumber":1,"title":"Episode One Updated","sources":[{"externalReference":"watch-main","purpose":"watch","priority":5,"resolutionMode":"dynamic","capabilities":{"progressTracking":true,"seek":true,"pictureInPicture":true,"playbackRate":true},"allowedHosts":["media.example.test"]}]}
    ]
  }'::jsonb,
  false
);

select is((select count(*)::integer from public.series where slug = 'phase7-imported'), 1, 'repeat import is series-idempotent');
select is((select count(*)::integer from public.provider_references where provider = 'test-provider'), 3, 'repeat import is mapping-idempotent');
select is((select description from public.series where slug = 'phase7-imported'), 'Initial description', 'repeat import preserves editorially overridable description');
select ok((select not is_published from public.episodes e join public.provider_references r on r.episode_id = e.id where r.provider = 'test-provider' and r.external_id = 'external-episode-2'), 'missing provider episode is unpublished, not deleted');
select ok((select not is_active from public.stream_source_definitions d join public.provider_references r on r.episode_id = d.episode_id where r.provider = 'test-provider' and r.external_id = 'external-episode-2'), 'missing provider source definition is disabled');

select throws_ok(
  $$select public.import_external_catalog('{"providerId":"rollback-provider","externalSeriesId":"bad-series","series":{"slug":"rollback-series","title":"Rollback","description":"","poster":{"url":"/images/poster-1.svg"},"genres":[],"tags":[]},"episodes":[{"externalId":"bad-1","episodeNumber":1,"title":"One","sources":[]},{"externalId":"bad-2","episodeNumber":1,"title":"Duplicate","sources":[]}]}'::jsonb, false)$$,
  '23505',
  null,
  'database failure rolls back the multi-table import'
);
select is((select count(*)::integer from public.series where slug = 'rollback-series'), 0, 'failed import leaves no partial series');

select * from finish();
rollback;
