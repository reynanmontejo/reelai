import type { EpisodeRepository } from '@/repositories/episode.repository';

export class EpisodeService {
  constructor(private readonly repository: EpisodeRepository) {}
  getBySeries(seriesId: string) { return this.repository.getBySeries(seriesId); }
  getBySeriesIds(seriesIds: string[], episodeNumber?: number) { return this.repository.getBySeriesIds(seriesIds, episodeNumber); }
  getById(id: string) { return this.repository.getById(id); }
  getByNumber(seriesId: string, episodeNumber: number) { return this.repository.getByNumber(seriesId, episodeNumber); }
  getNextEpisode(id: string) { return this.repository.getNext(id); }
  getPreviousEpisode(id: string) { return this.repository.getPrevious(id); }
}
