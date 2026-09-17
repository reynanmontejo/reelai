import { ApplicationError, catalogUnavailable } from '@/lib/application-error';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { ContentProvider } from '@/types/provider';
import type { DatabaseEpisodeRow, DatabaseSeriesRow, DatabaseStreamSourceRow } from '@/types/database';
import type { Episode } from '@/types/episode';
import type { Series } from '@/types/series';
import type { StreamSource, StreamType } from '@/types/stream';

const SERIES_COLUMNS = 'id,slug,title,alternative_title,description,poster_url,banner_url,release_year,status,episode_count,genres,tags,is_ai_original,badge';
const EPISODE_COLUMNS = 'id,series_id,episode_number,title,description,thumbnail_url,duration_seconds,release_date';
const STREAM_COLUMNS = 'id,episode_id,provider,stream_type,stream_purpose,url,priority,is_active,capabilities';
const validStreamTypes: StreamType[] = ['mp4', 'webm', 'hls', 'embed'];

function invalidData(entity: string, row: unknown): never {
  throw new ApplicationError('INVALID_CONTENT_DATA', `The catalog returned invalid ${entity} data.`, { context: { entity, row } });
}

const mapSeries = (row: DatabaseSeriesRow): Series => {
  if (!row || typeof row.id !== 'string' || typeof row.slug !== 'string' || typeof row.title !== 'string' || typeof row.description !== 'string' || typeof row.poster_url !== 'string' || !Number.isInteger(row.episode_count) || !Array.isArray(row.genres) || !Array.isArray(row.tags)) invalidData('series', row);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    alternativeTitle: row.alternative_title || undefined,
    description: row.description,
    posterUrl: row.poster_url,
    bannerUrl: row.banner_url || undefined,
    releaseYear: row.release_year || undefined,
    status: row.status || undefined,
    episodeCount: row.episode_count,
    genres: row.genres,
    tags: row.tags,
    isAiOriginal: row.is_ai_original,
    badge: row.badge || undefined,
  };
};

const mapEpisode = (row: DatabaseEpisodeRow): Episode => {
  if (!row || typeof row.id !== 'string' || typeof row.series_id !== 'string' || !Number.isInteger(row.episode_number) || typeof row.title !== 'string') invalidData('episode', row);
  return {
    id: row.id,
    seriesId: row.series_id,
    episodeNumber: row.episode_number,
    title: row.title,
    description: row.description || undefined,
    thumbnailUrl: row.thumbnail_url || undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    releaseDate: row.release_date || undefined,
  };
};

const mapStream = (row: DatabaseStreamSourceRow): StreamSource => {
  const capabilities = row?.capabilities;
  if (!row || typeof row.id !== 'string' || typeof row.episode_id !== 'string' || !validStreamTypes.includes(row.stream_type) || typeof row.url !== 'string' || !capabilities || typeof capabilities.progressTracking !== 'boolean' || typeof capabilities.seek !== 'boolean' || typeof capabilities.pictureInPicture !== 'boolean' || typeof capabilities.playbackRate !== 'boolean') invalidData('stream source', row);
  return {
    id: row.id,
    episodeId: row.episode_id,
    provider: row.provider,
    type: row.stream_type,
    url: row.url,
    priority: row.priority,
    isActive: row.is_active,
    capabilities: row.capabilities,
  };
};

function assertResult<T>(operation: string, data: T | null, error: unknown): T {
  if (error) throw catalogUnavailable(operation, error);
  if (data === null) throw catalogUnavailable(operation, new Error('Supabase returned no data.'));
  return data;
}

export class SupabaseContentProvider implements ContentProvider {
  readonly name = 'Supabase';

  async getAllSeries() {
    const result = await getSupabaseClient().from('series').select(SERIES_COLUMNS).order('trending_rank').order('created_at', { ascending: false }).limit(100);
    return (assertResult('getAllSeries', result.data, result.error) as DatabaseSeriesRow[]).map(mapSeries);
  }
  async getSeriesById(id: string) {
    const result = await getSupabaseClient().from('series').select(SERIES_COLUMNS).eq('id', id).maybeSingle();
    if (result.error) throw catalogUnavailable('getSeriesById', result.error);
    return result.data ? mapSeries(result.data as DatabaseSeriesRow) : null;
  }
  async getSeriesBySlug(slug: string) {
    const result = await getSupabaseClient().from('series').select(SERIES_COLUMNS).eq('slug', slug).maybeSingle();
    if (result.error) throw catalogUnavailable('getSeriesBySlug', result.error);
    return result.data ? mapSeries(result.data as DatabaseSeriesRow) : null;
  }
  async getFeaturedSeries() {
    const result = await getSupabaseClient().from('series').select(SERIES_COLUMNS).gt('trending_rank', 0).order('trending_rank').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw catalogUnavailable('getFeaturedSeries', result.error);
    return result.data ? mapSeries(result.data as DatabaseSeriesRow) : null;
  }
  async getTrending() {
    const result = await getSupabaseClient().from('series').select(SERIES_COLUMNS).order('trending_rank').order('created_at', { ascending: false }).limit(12);
    return (assertResult('getTrending', result.data, result.error) as DatabaseSeriesRow[]).map(mapSeries);
  }
  async getNewReleases() {
    const result = await getSupabaseClient().from('series').select(SERIES_COLUMNS).order('release_year', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('trending_rank').limit(12);
    return (assertResult('getNewReleases', result.data, result.error) as DatabaseSeriesRow[]).map(mapSeries);
  }
  async getSeriesByGenre(genre: string) { return this.searchSeries('', genre); }
  async getGenres() {
    const result = await getSupabaseClient().from('series').select('genres').order('trending_rank').limit(100);
    const rows = assertResult('getGenres', result.data, result.error) as Array<{ genres: unknown }>;
    if (rows.some((row) => !Array.isArray(row.genres))) invalidData('genres', rows);
    return [...new Set(rows.flatMap((row) => row.genres as string[]))].sort((a, b) => a.localeCompare(b));
  }
  async searchSeries(query: string, genre?: string) {
    const result = await getSupabaseClient().rpc('search_series_catalog', {
      search_query: query.trim() || null,
      genre_filter: genre?.trim() || null,
      result_limit: 50,
    });
    return (assertResult('searchSeries', result.data, result.error) as DatabaseSeriesRow[]).map(mapSeries);
  }

  async getEpisodeById(id: string) {
    const result = await getSupabaseClient().from('episodes').select(EPISODE_COLUMNS).eq('id', id).maybeSingle();
    if (result.error) throw catalogUnavailable('getEpisodeById', result.error);
    return result.data ? mapEpisode(result.data as DatabaseEpisodeRow) : null;
  }
  async getEpisodeByNumber(seriesId: string, episodeNumber: number) {
    const result = await getSupabaseClient().from('episodes').select(EPISODE_COLUMNS).eq('series_id', seriesId).eq('episode_number', episodeNumber).maybeSingle();
    if (result.error) throw catalogUnavailable('getEpisodeByNumber', result.error);
    return result.data ? mapEpisode(result.data as DatabaseEpisodeRow) : null;
  }
  async getEpisodesBySeriesId(seriesId: string) {
    const result = await getSupabaseClient().from('episodes').select(EPISODE_COLUMNS).eq('series_id', seriesId).order('episode_number');
    return (assertResult('getEpisodesBySeriesId', result.data, result.error) as DatabaseEpisodeRow[]).map(mapEpisode);
  }
  async getEpisodesBySeriesIds(seriesIds: string[], episodeNumber?: number) {
    if (!seriesIds.length) return [];
    let query = getSupabaseClient().from('episodes').select(EPISODE_COLUMNS).in('series_id', seriesIds);
    if (episodeNumber !== undefined) query = query.eq('episode_number', episodeNumber);
    const result = await query.order('series_id').order('episode_number');
    return (assertResult('getEpisodesBySeriesIds', result.data, result.error) as DatabaseEpisodeRow[]).map(mapEpisode);
  }
  async getNextEpisode(id: string) {
    const current = await this.getEpisodeById(id);
    if (!current) return null;
    const result = await getSupabaseClient().from('episodes').select(EPISODE_COLUMNS).eq('series_id', current.seriesId).gt('episode_number', current.episodeNumber).order('episode_number').limit(1).maybeSingle();
    if (result.error) throw catalogUnavailable('getNextEpisode', result.error);
    return result.data ? mapEpisode(result.data as DatabaseEpisodeRow) : null;
  }
  async getPreviousEpisode(id: string) {
    const current = await this.getEpisodeById(id);
    if (!current) return null;
    const result = await getSupabaseClient().from('episodes').select(EPISODE_COLUMNS).eq('series_id', current.seriesId).lt('episode_number', current.episodeNumber).order('episode_number', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw catalogUnavailable('getPreviousEpisode', result.error);
    return result.data ? mapEpisode(result.data as DatabaseEpisodeRow) : null;
  }
  async getStreamSourcesByEpisodeId(episodeId: string, purpose: 'watch' | 'feed' = 'watch') {
    const result = await getSupabaseClient().from('stream_sources').select(STREAM_COLUMNS).eq('episode_id', episodeId).eq('is_active', true).or(`stream_purpose.eq.${purpose},stream_purpose.eq.both`).order('priority');
    return (assertResult('getStreamSourcesByEpisodeId', result.data, result.error) as DatabaseStreamSourceRow[]).map(mapStream);
  }

  async getSeries(id: string) {
    const series = await this.getSeriesById(id);
    if (!series) throw new ApplicationError('INVALID_CONTENT_DATA', 'The requested series was not found.', { context: { id } });
    return series;
  }
  async getEpisodes(seriesId: string) { return this.getEpisodesBySeriesId(seriesId); }
  async getStreamSources(episodeId: string) { return this.getStreamSourcesByEpisodeId(episodeId); }
}
