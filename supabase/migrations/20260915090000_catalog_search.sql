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
