import type { LikesRepository } from '@/repositories/likes.repository';

export class LikesService {
  constructor(private readonly repository: LikesRepository) {}
  getIds() { return this.repository.getAll(); }
  toggle(episodeId: string) { return this.repository.toggle(episodeId); }
  subscribe(listener: () => void) { return this.repository.subscribe(listener); }
}
