begin;
select plan(8);

create temporary table isolation_first_id as
select public.import_external_catalog('{
  "providerId":"source-isolation-test","externalSeriesId":"series-a",
  "series":{"slug":"source-isolation-a","title":"Series A","poster":{"url":"/images/poster-1.svg"},"genres":[],"tags":[]},
  "episodes":[
    {"externalId":"a-1","episodeNumber":1,"title":"A1","sources":[{"externalReference":"a-main","purpose":"both","priority":10,"resolutionMode":"dynamic"}]},
    {"externalId":"a-2","episodeNumber":2,"title":"A2","sources":[{"externalReference":"a-two","purpose":"watch","priority":10,"resolutionMode":"dynamic"}]}
  ]
}'::jsonb,true)->>'seriesId' as id;

select public.import_external_catalog('{
  "providerId":"source-isolation-test","externalSeriesId":"series-b",
  "series":{"slug":"source-isolation-b","title":"Series B","poster":{"url":"/images/poster-2.svg"},"genres":[],"tags":[]},
  "episodes":[{"externalId":"b-1","episodeNumber":1,"title":"B1","sources":[{"externalReference":"b-main","purpose":"feed","priority":10,"resolutionMode":"dynamic"}]}]
}'::jsonb,true);

select is((select count(*)::integer from public.stream_source_definitions d join public.episodes e on e.id=d.episode_id join public.series s on s.id=e.series_id where s.slug='source-isolation-a' and d.is_active),2,'importing B preserves both sources in A');
select ok((select is_active from public.stream_source_definitions where provider_id='source-isolation-test' and external_reference='b-main'),'B source is active');
select is((select id::text from public.series where slug='source-isolation-a'),(select id from isolation_first_id),'A UUID stays unchanged');

select public.import_external_catalog('{
  "providerId":"source-isolation-test","externalSeriesId":"series-a",
  "series":{"slug":"source-isolation-a","title":"Series A","poster":{"url":"/images/poster-1.svg"},"genres":[],"tags":[]},
  "episodes":[{"externalId":"a-1","episodeNumber":1,"title":"A1","sources":[{"externalReference":"a-new","purpose":"watch","priority":10,"resolutionMode":"dynamic"}]}]
}'::jsonb,true);

select ok((select not is_active from public.stream_source_definitions where provider_id='source-isolation-test' and external_reference='a-main'),'removed source in A is retired');
select ok((select is_active from public.stream_source_definitions where provider_id='source-isolation-test' and external_reference='a-new'),'replacement source in A is active');
select ok((select not e.is_published from public.episodes e join public.provider_references r on r.episode_id=e.id where r.provider='source-isolation-test' and r.external_id='a-2'),'removed episode in A is unpublished');
select ok((select is_active from public.stream_source_definitions where provider_id='source-isolation-test' and external_reference='b-main'),'updating A preserves B source');
select ok((select e.is_published from public.episodes e join public.provider_references r on r.episode_id=e.id where r.provider='source-isolation-test' and r.external_id='b-1'),'updating A preserves B publication');

select * from finish();
rollback;
