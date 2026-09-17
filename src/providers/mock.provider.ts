import { mockEpisodeSeed, mockFeedStreamSeed, mockSeriesSeed, mockStreamSeed } from '@/lib/data';
import type { ContentProvider } from '@/types/provider';

const copy = <T,>(value: T): T => structuredClone(value);
const byEpisodeNumber = (a: { episodeNumber: number }, b: { episodeNumber: number }) => a.episodeNumber - b.episodeNumber;

export class MockContentProvider implements ContentProvider {
  readonly name = 'MockContent';
  async getAllSeries() { return copy(mockSeriesSeed); }
  async getSeriesById(id: string) { return copy(mockSeriesSeed.find((series) => series.id === id) || null); }
  async getSeriesBySlug(slug: string) { return copy(mockSeriesSeed.find((series) => series.slug === slug) || null); }
  async getFeaturedSeries() { return copy(mockSeriesSeed[0] || null); }
  async getTrending() { return copy(mockSeriesSeed); }
  async getNewReleases() { return copy([...mockSeriesSeed].sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0))); }
  async getSeriesByGenre(genre: string) { return copy(mockSeriesSeed.filter((series) => series.genres.some((item) => item.toLowerCase() === genre.trim().toLowerCase()))); }
  async getGenres() { return [...new Set(mockSeriesSeed.flatMap((series) => series.genres))].sort(); }
  async searchSeries(query: string, genre?: string) {
    const normalized = query.trim().toLowerCase();
    const normalizedGenre = genre?.trim().toLowerCase();
    return copy(mockSeriesSeed.filter((series) => {
      const genreMatches = !normalizedGenre || series.genres.some((item) => item.toLowerCase() === normalizedGenre);
      const searchText = [series.title, series.alternativeTitle, series.description, ...series.genres, ...(series.tags || [])].filter(Boolean).join(' ').toLowerCase();
      return genreMatches && (!normalized || searchText.includes(normalized));
    }));
  }
  async getEpisodeById(id: string) { return copy(mockEpisodeSeed.find((episode) => episode.id === id) || null); }
  async getEpisodeByNumber(seriesId: string, episodeNumber: number) { return copy(mockEpisodeSeed.find((episode) => episode.seriesId === seriesId && episode.episodeNumber === episodeNumber) || null); }
  async getEpisodesBySeriesId(seriesId: string) { return copy(mockEpisodeSeed.filter((episode) => episode.seriesId === seriesId).sort(byEpisodeNumber)); }
  async getEpisodesBySeriesIds(seriesIds: string[], episodeNumber?: number) {
    const ids = new Set(seriesIds);
    return copy(mockEpisodeSeed.filter((episode) => ids.has(episode.seriesId) && (episodeNumber === undefined || episode.episodeNumber === episodeNumber)).sort(byEpisodeNumber));
  }
  async getNextEpisode(id: string) {
    const current = mockEpisodeSeed.find((episode) => episode.id === id);
    return current ? this.getEpisodeByNumber(current.seriesId, current.episodeNumber + 1) : null;
  }
  async getPreviousEpisode(id: string) {
    const current = mockEpisodeSeed.find((episode) => episode.id === id);
    return current && current.episodeNumber > 1 ? this.getEpisodeByNumber(current.seriesId, current.episodeNumber - 1) : null;
  }
  async getStreamSourcesByEpisodeId(episodeId: string, purpose: 'watch' | 'feed' = 'watch') {
    return copy((purpose === 'feed' ? mockFeedStreamSeed : mockStreamSeed).filter((source) => source.episodeId === episodeId && source.isActive).sort((a, b) => a.priority - b.priority));
  }
  async getSeries(id: string) {
    const series = await this.getSeriesById(id);
    if (!series) throw new Error(`Series not found for ${id}`);
    return series;
  }
  async getEpisodes(seriesId: string) { return this.getEpisodesBySeriesId(seriesId); }
  async getStreamSources(episodeId: string) { return this.getStreamSourcesByEpisodeId(episodeId); }
}
