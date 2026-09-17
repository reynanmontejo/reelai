begin;
select plan(12);

select has_table('public', 'series', 'series table exists');
select has_table('public', 'episodes', 'episodes table exists');
select has_table('public', 'stream_sources', 'stream_sources table exists');
select has_table('public', 'provider_references', 'provider_references table exists');
select has_table('public', 'favorites', 'favorites table exists');
select has_table('public', 'episode_likes', 'episode_likes table exists');
select has_table('public', 'watch_history', 'watch_history table exists');
select has_table('public', 'user_preferences', 'user_preferences table exists');

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public'),
  17,
  'all expected RLS policies exist'
);

select is(
  (select count(*)::integer from pg_class where relnamespace = 'public'::regnamespace and relname in ('series', 'episodes', 'stream_sources', 'provider_references') and relrowsecurity),
  4,
  'RLS is enabled on every catalog table'
);

select is(
  (select count(*)::integer from pg_class where relnamespace = 'public'::regnamespace and relname in ('favorites', 'episode_likes', 'watch_history', 'user_preferences') and relrowsecurity),
  4,
  'RLS is enabled on every user-owned table'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and table_name in ('favorites', 'episode_likes', 'watch_history', 'user_preferences')),
  0,
  'anonymous users have no user-state table grants'
);

select * from finish();
rollback;
