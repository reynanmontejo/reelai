begin;
select plan(7);

select is((select count(*) from public.search_series_catalog(null, null, 50)), 8::bigint, 'empty search returns the published catalog');
select is((select count(*) from public.search_series_catalog('romance', null, 50)), 3::bigint, 'search includes case-insensitive genre text');
select is((select count(*) from public.search_series_catalog(null, 'Sci-Fi', 50)), 2::bigint, 'genre filter is case-insensitive');
select is((select count(*) from public.search_series_catalog('Secrets', null, 50)), 2::bigint, 'search includes tags and descriptions');
select is((select count(*) from public.search_series_catalog('CEO''s', null, 50)), 1::bigint, 'apostrophes are handled as literal search text');
select is((select count(*) from public.search_series_catalog('no such reelai story', null, 50)), 0::bigint, 'no-result search returns an empty set');
select is((select count(*) from public.search_series_catalog(null, null, 2)), 2::bigint, 'result limit is enforced');

select * from finish();
rollback;
