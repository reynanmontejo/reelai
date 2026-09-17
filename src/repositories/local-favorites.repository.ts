import { localStorageEngine } from '@/lib/local-storage';
import type { FavoritesRepository } from './favorites.repository';

export class LocalFavoritesRepository implements FavoritesRepository {
  async getAll() { return localStorageEngine.read().favorites; }
  async toggle(seriesId: string) { localStorageEngine.update((document) => ({ ...document, favorites: document.favorites.includes(seriesId) ? document.favorites.filter((id) => id !== seriesId) : [...document.favorites, seriesId] })); }
  subscribe(listener: () => void) { return localStorageEngine.subscribe(listener); }
}
