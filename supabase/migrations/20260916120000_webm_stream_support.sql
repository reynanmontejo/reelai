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
