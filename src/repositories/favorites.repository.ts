export interface FavoritesRepository {
  getAll(): Promise<string[]>;
  toggle(seriesId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}
