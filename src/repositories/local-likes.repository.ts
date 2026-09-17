import { localStorageEngine } from '@/lib/local-storage';
import type { LikesRepository } from './likes.repository';

export class LocalLikesRepository implements LikesRepository {
  async getAll() { return localStorageEngine.read().likes; }
  async toggle(episodeId: string) { localStorageEngine.update((document) => ({ ...document, likes: document.likes.includes(episodeId) ? document.likes.filter((id) => id !== episodeId) : [...document.likes, episodeId] })); }
  subscribe(listener: () => void) { return localStorageEngine.subscribe(listener); }
}
