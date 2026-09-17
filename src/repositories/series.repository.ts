import type { Series } from '@/types/series';
import type { ContentProvider } from '@/types/provider';

export interface SeriesRepository {
  getAll(): Promise<Series[]>;
  getById(id: string): Promise<Series | null>;
  getBySlug(slug: string): Promise<Series | null>;
  getFeatured(): Promise<Series | null>;
  getTrending(): Promise<Series[]>;
  getNewReleases(): Promise<Series[]>;
  getByGenre(genre: string): Promise<Series[]>;
  getGenres(): Promise<string[]>;
  search(query: string, genre?: string): Promise<Series[]>;
}

export class ProviderSeriesRepository implements SeriesRepository {
  constructor(private readonly provider: ContentProvider) {}
  getAll() { return this.provider.getAllSeries(); }
  getById(id: string) { return this.provider.getSeriesById(id); }
  getBySlug(slug: string) { return this.provider.getSeriesBySlug(slug); }
  getFeatured() { return this.provider.getFeaturedSeries(); }
  getTrending() { return this.provider.getTrending(); }
  getNewReleases() { return this.provider.getNewReleases(); }
  getByGenre(genre: string) { return this.provider.getSeriesByGenre(genre); }
  getGenres() { return this.provider.getGenres(); }
  search(query: string, genre?: string) { return this.provider.searchSeries(query, genre); }
}
