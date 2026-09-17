import type { StreamSource } from '@/types/stream';
import type { ContentProvider } from '@/types/provider';

export interface StreamRepository {
  getSources(episodeId: string, purpose?: 'watch' | 'feed'): Promise<StreamSource[]>;
}

export class ProviderStreamRepository implements StreamRepository {
  constructor(private readonly provider: ContentProvider) {}
  getSources(episodeId: string, purpose: 'watch' | 'feed' = 'watch') { return this.provider.getStreamSourcesByEpisodeId(episodeId, purpose); }
}
