begin;
select plan(22);

create function pg_temp.operation_denied(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when insufficient_privilege then return true;
end;
$$;

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'rls-user-a@example.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'rls-user-b@example.invalid');

insert into public.favorites (user_id, series_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000002');
insert into public.episode_likes (user_id, episode_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000101'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-000000000201');
insert into public.watch_history (user_id, episode_id, position_seconds, duration_seconds) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000101', 10, 124),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-000000000201', 20, 124);
insert into public.user_preferences (user_id, autoplay) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

set local role anon;
select is((select count(*) from public.series), 8::bigint, 'anonymous users read published series');
select is((select count(*) from public.episodes), 96::bigint, 'anonymous users read published episodes');
select is((select count(*) from public.stream_sources), 192::bigint, 'anonymous users read only public active stream metadata');
select ok(pg_temp.operation_denied($sql$insert into public.series (slug, title, poster_url) values ('forbidden', 'Forbidden', '/forbidden.svg')$sql$), 'anonymous catalog writes are denied');
select ok(pg_temp.operation_denied('select count(*) from public.favorites'), 'anonymous favorite reads are denied');
select ok(pg_temp.operation_denied('select count(*) from public.episode_likes'), 'anonymous like reads are denied');
select ok(pg_temp.operation_denied('select count(*) from public.watch_history'), 'anonymous history reads are denied');
select ok(pg_temp.operation_denied('select count(*) from public.user_preferences'), 'anonymous preference reads are denied');

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.favorites), 1::bigint, 'User A sees only User A favorites');
select is((select count(*) from public.episode_likes), 1::bigint, 'User A sees only User A likes');
select is((select count(*) from public.watch_history), 1::bigint, 'User A sees only User A history');
select is((select count(*) from public.user_preferences), 1::bigint, 'User A sees only User A preferences');
select lives_ok($sql$insert into public.favorites (user_id, series_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000003')$sql$, 'User A can add a User A favorite');
select ok(pg_temp.operation_denied($sql$insert into public.favorites (user_id, series_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000003')$sql$), 'User A cannot add a User B favorite');
select lives_ok($sql$update public.watch_history set position_seconds = 30 where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$sql$, 'User A can update User A history');

reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.favorites), 1::bigint, 'User B sees only User B favorites');
select is((select count(*) from public.episode_likes), 1::bigint, 'User B sees only User B likes');
select is((select count(*) from public.watch_history), 1::bigint, 'User B sees only User B history');
select is((select count(*) from public.user_preferences), 1::bigint, 'User B sees only User B preferences');
select lives_ok($sql$insert into public.episode_likes (user_id, episode_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-000000000203')$sql$, 'User B can add a User B like');
select ok(pg_temp.operation_denied($sql$insert into public.episode_likes (user_id, episode_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000203')$sql$), 'User B cannot add a User A like');
select lives_ok($sql$update public.user_preferences set autoplay = true where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$sql$, 'User B can update User B preferences');

select * from finish();
rollback;
