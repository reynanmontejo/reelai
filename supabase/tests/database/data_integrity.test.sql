begin;
select plan(18);

select is((select count(*) from public.series), 8::bigint, 'seed contains 8 series');
select is((select count(*) from public.episodes), 96::bigint, 'seed contains 96 episodes');
select is((select count(*) from public.stream_sources where stream_purpose = 'watch'), 96::bigint, 'seed contains 96 watch sources');
select is((select count(*) from public.stream_sources where stream_purpose = 'feed'), 96::bigint, 'seed contains 96 feed sources');
select is((select count(*) from public.provider_references), 104::bigint, 'seed contains 104 provider mappings');

select is((select count(*) from public.stream_sources where stream_purpose not in ('watch', 'feed', 'both')), 0::bigint, 'all source purposes are valid');
select is((select count(*) from public.stream_sources where priority < 0), 0::bigint, 'all source priorities are non-negative');
select is((select count(*) from (select episode_id from public.stream_sources where stream_purpose = 'watch' group by episode_id having count(*) = 1) sources), 96::bigint, 'every episode has one seeded watch source');
select is((select count(*) from (select episode_id from public.stream_sources where stream_purpose = 'feed' group by episode_id having count(*) = 1) sources), 96::bigint, 'every episode has one seeded feed source');

select is((select count(*) from public.provider_references where entity_type = 'series'), 8::bigint, 'all series have provider mappings');
select is((select count(*) from public.provider_references where entity_type = 'episode'), 96::bigint, 'all episodes have provider mappings');
select is((select count(*) from public.provider_references where external_id = coalesce(series_id::text, episode_id::text)), 0::bigint, 'provider IDs remain separate from internal UUIDs');

select is((select count(*) from pg_constraint where connamespace = 'public'::regnamespace and contype = 'f'), 12::bigint, 'all expected foreign keys exist');
select is((select count(*) from pg_constraint where connamespace = 'public'::regnamespace and contype = 'p'), 11::bigint, 'every application table has a primary key');
select is((select count(*) from pg_constraint where connamespace = 'public'::regnamespace and contype = 'u'), 4::bigint, 'catalog natural-key uniqueness constraints exist');

select has_index('public', 'provider_references', 'provider_references_series_unique', 'series provider mapping uniqueness is indexed');
select has_index('public', 'provider_references', 'provider_references_episode_unique', 'episode provider mapping uniqueness is indexed');
select has_index('public', 'stream_sources', 'stream_sources_resolution_idx', 'stream resolution priority is indexed');

select * from finish();
rollback;
