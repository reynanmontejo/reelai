import type { HistoryRepository } from '@/repositories/history.repository';
import type { SaveProgressInput } from '@/types/history';

export class HistoryService {
  constructor(private readonly repository: HistoryRepository) {}
  async getHistory() { return (await this.repository.getAll()).filter((item) => item.positionSeconds > 0 || item.completed).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async getResumePosition(episodeId: string) { return (await this.repository.getByEpisodeId(episodeId))?.positionSeconds || 0; }
  saveProgress(input: SaveProgressInput) { return this.repository.saveProgress(input); }
  subscribe(listener: () => void) { return this.repository.subscribe(listener); }
}
