import type { Episode } from '@/types/episode';
import type { ContentProvider } from '@/types/provider';

export interface EpisodeRepository {
  getBySeries(seriesId: string): Promise<Episode[]>;
  getBySeriesIds(seriesIds: string[], episodeNumber?: number): Promise<Episode[]>;
  getById(id: string): Promise<Episode | null>;
  getByNumber(seriesId: string, episodeNumber: number): Promise<Episode | null>;
  getNext(id: string): Promise<Episode | null>;
  getPrevious(id: string): Promise<Episode | null>;
}

export class ProviderEpisodeRepository implements EpisodeRepository {
  constructor(private readonly provider: ContentProvider) {}
  getBySeries(seriesId: string) { return this.provider.getEpisodesBySeriesId(seriesId); }
  getBySeriesIds(seriesIds: string[], episodeNumber?: number) { return this.provider.getEpisodesBySeriesIds(seriesIds, episodeNumber); }
  getById(id: string) { return this.provider.getEpisodeById(id); }
  getByNumber(seriesId: string, episodeNumber: number) { return this.provider.getEpisodeByNumber(seriesId, episodeNumber); }
  getNext(id: string) { return this.provider.getNextEpisode(id); }
  getPrevious(id: string) { return this.provider.getPreviousEpisode(id); }
}
