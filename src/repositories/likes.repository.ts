export interface LikesRepository {
  getAll(): Promise<string[]>;
  toggle(episodeId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}
