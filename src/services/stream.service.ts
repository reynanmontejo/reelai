import type { StreamRepository } from '@/repositories/stream.repository';
import { ApplicationError } from '@/lib/application-error';

export class StreamService {
  constructor(private readonly repository: StreamRepository) {}
  async getSources(episodeId: string, purpose: 'watch' | 'feed' = 'watch') { return (await this.repository.getSources(episodeId, purpose)).filter((source) => source.isActive).sort((a, b) => a.priority - b.priority); }
  async resolve(episodeId: string, purpose: 'watch' | 'feed' = 'watch') { const source = (await this.getSources(episodeId, purpose))[0]; if (!source) throw new ApplicationError('STREAM_NOT_FOUND', 'No active stream source is available for this episode.', { context: { episodeId, purpose } }); return source; }
}
