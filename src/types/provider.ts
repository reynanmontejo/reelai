import type { Episode } from './episode';
import type { Series } from './series';
import type { StreamSource } from './stream';

export type ProviderEntityType = 'series' | 'episode';

export interface ProviderReference {
  id: string;
  provider: string;
  entityType: ProviderEntityType;
  internalId: string;
  externalId: string;
}

export interface StreamProvider {
  name: string;
  getSeries(internalId: string): Promise<Series>;
  getEpisodes(internalSeriesId: string): Promise<Episode[]>;
  getStreamSources(internalEpisodeId: string): Promise<StreamSource[]>;
}

export interface ContentProvider extends StreamProvider {
  getAllSeries(): Promise<Series[]>;
  getSeriesById(id: string): Promise<Series | null>;
  getSeriesBySlug(slug: string): Promise<Series | null>;
  getFeaturedSeries(): Promise<Series | null>;
  getTrending(): Promise<Series[]>;
  getNewReleases(): Promise<Series[]>;
  getSeriesByGenre(genre: string): Promise<Series[]>;
  getGenres(): Promise<string[]>;
  searchSeries(query: string, genre?: string): Promise<Series[]>;
  getEpisodeById(id: string): Promise<Episode | null>;
  getEpisodeByNumber(seriesId: string, episodeNumber: number): Promise<Episode | null>;
  getNextEpisode(id: string): Promise<Episode | null>;
  getPreviousEpisode(id: string): Promise<Episode | null>;
  getEpisodesBySeriesId(seriesId: string): Promise<Episode[]>;
  getEpisodesBySeriesIds(seriesIds: string[], episodeNumber?: number): Promise<Episode[]>;
  getStreamSourcesByEpisodeId(episodeId: string, purpose?: 'watch' | 'feed'): Promise<StreamSource[]>;
}
