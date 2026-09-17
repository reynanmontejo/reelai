import type { FavoritesRepository } from '@/repositories/favorites.repository';
import type { SeriesRepository } from '@/repositories/series.repository';

export class FavoritesService {
  constructor(private readonly repository: FavoritesRepository, private readonly seriesRepository: SeriesRepository) {}
  getIds() { return this.repository.getAll(); }
  async getFavorites() { const ids = await this.repository.getAll(); return (await this.seriesRepository.getAll()).filter((series) => ids.includes(series.id)); }
  toggle(seriesId: string) { return this.repository.toggle(seriesId); }
  subscribe(listener: () => void) { return this.repository.subscribe(listener); }
}
