import { localStorageEngine } from '@/lib/local-storage';
import type { SaveProgressInput } from '@/types/history';
import type { HistoryRepository } from './history.repository';

export class LocalHistoryRepository implements HistoryRepository {
  async getAll() { return Object.values(localStorageEngine.read().history); }
  async getByEpisodeId(episodeId: string) { return localStorageEngine.read().history[episodeId] || null; }
  async saveProgress(input: SaveProgressInput) {
    localStorageEngine.update((document) => {
      const existing = document.history[input.episodeId];
      if (input.positionSeconds <= 0 && !existing) return document;
      const completed = input.durationSeconds > 0 && input.positionSeconds / input.durationSeconds >= 0.9;
      return { ...document, history: { ...document.history, [input.episodeId]: { ...input, completed, updatedAt: new Date().toISOString() } } };
    });
  }
  subscribe(listener: () => void) { return localStorageEngine.subscribe(listener); }
}
