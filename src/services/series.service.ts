import type { SeriesRepository } from '@/repositories/series.repository';

export class SeriesService {
  constructor(private readonly repository: SeriesRepository) {}
  getAll() { return this.repository.getAll(); }
  getById(id: string) { return this.repository.getById(id); }
  getBySlug(slug: string) { return this.repository.getBySlug(slug); }
  getFeatured() { return this.repository.getFeatured(); }
  getTrending() { return this.repository.getTrending(); }
  getNewReleases() { return this.repository.getNewReleases(); }
  getByGenre(genre: string) { return this.repository.getByGenre(genre); }
  getGenres() { return this.repository.getGenres(); }
  search(query: string, genre?: string) { return this.repository.search(query, genre); }
}
