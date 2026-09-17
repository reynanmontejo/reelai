import type { SaveProgressInput, WatchProgress } from '@/types/history';

export interface HistoryRepository {
  getAll(): Promise<WatchProgress[]>;
  getByEpisodeId(episodeId: string): Promise<WatchProgress | null>;
  saveProgress(input: SaveProgressInput): Promise<void>;
  subscribe(listener: () => void): () => void;
}
