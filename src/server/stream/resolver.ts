import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { getExternalProviderRegistry, type ExternalProviderRegistry } from '@/server/providers/external/registry';
import { executeProviderResolution } from '@/server/providers/external/execution';
import { assertProviderHealthy, recordProviderFailure, recordProviderSuccess } from '@/server/providers/health';
import { validatePlaybackUrl } from '@/server/security/url-policy';
import { getServerSupabaseClient } from '@/server/supabase/admin';
import type { ResolvedPlaybackCandidate } from '@/types/external-provider';
import type { StreamCapabilities, StreamPurpose, StreamType } from '@/types/stream';

type ResolutionPurpose = Exclude<StreamPurpose, 'both'>;
type SourceDefinitionRow = {
  id: string;
  episode_id: string;
  provider_id: string;
  external_reference: string;
  stream_purpose: StreamPurpose;
  priority: number;
  resolution_mode: 'static' | 'dynamic';
  static_stream_type: StreamType | null;
  static_url: string | null;
  capabilities: StreamCapabilities;
  allowed_hosts: string[];
};

type StaticSourceRow = {
  id: string;
  episode_id: string;
  provider: string;
  stream_type: StreamType;
  stream_purpose: StreamPurpose;
  url: string;
  priority: number;
  capabilities: StreamCapabilities;
};

function errorCode(error: unknown) {
  return error instanceof ApplicationError ? error.code : 'PROVIDER_UNAVAILABLE';
}

export class ServerStreamResolver {
  constructor(
    private readonly registry: ExternalProviderRegistry = getExternalProviderRegistry(),
    private readonly timeoutMs = 8_000,
  ) {}

  async resolve(episodeId: string, purpose: ResolutionPurpose): Promise<ResolvedPlaybackCandidate[]> {
    const client = getServerSupabaseClient();
    const episode = await client.from('episodes').select('id,is_published').eq('id', episodeId).maybeSingle();
    if (episode.error) throw new ApplicationError('CATALOG_UNAVAILABLE', 'The catalog is temporarily unavailable.', { cause: episode.error });
    if (!episode.data?.is_published) throw new ApplicationError('EPISODE_NOT_FOUND', 'The requested episode was not found.');

    const [staticResult, definitionResult, referenceResult] = await Promise.all([
      client.from('stream_sources')
        .select('id,episode_id,provider,stream_type,stream_purpose,url,priority,capabilities')
        .eq('episode_id', episodeId).eq('is_active', true).eq('is_public', true)
        .or(`stream_purpose.eq.${purpose},stream_purpose.eq.both`).order('priority'),
      client.from('stream_source_definitions')
        .select('id,episode_id,provider_id,external_reference,stream_purpose,priority,resolution_mode,static_stream_type,static_url,capabilities,allowed_hosts')
        .eq('episode_id', episodeId).eq('is_active', true)
        .or(`stream_purpose.eq.${purpose},stream_purpose.eq.both`).order('priority'),
      client.from('provider_references').select('provider,external_id').eq('episode_id', episodeId).eq('entity_type', 'episode'),
    ]);
    if (staticResult.error || definitionResult.error || referenceResult.error) {
      throw new ApplicationError('CATALOG_UNAVAILABLE', 'Stream configuration is temporarily unavailable.', {
        cause: staticResult.error || definitionResult.error || referenceResult.error,
      });
    }

    const candidates: ResolvedPlaybackCandidate[] = (staticResult.data as StaticSourceRow[]).map((source) => ({
      sourceDefinitionId: source.id,
      episodeId,
      providerId: source.provider,
      type: source.stream_type,
      url: source.url,
      priority: source.priority,
      capabilities: source.capabilities,
    }));
    const externalIds = new Map((referenceResult.data as Array<{ provider: string; external_id: string }>).map((row) => [row.provider, row.external_id]));

    for (const definition of definitionResult.data as SourceDefinitionRow[]) {
      if (definition.resolution_mode === 'static') {
        if (!definition.static_stream_type || !definition.static_url) continue;
        candidates.push({
          sourceDefinitionId: definition.id,
          episodeId,
          providerId: definition.provider_id,
          type: definition.static_stream_type,
          url: definition.static_url,
          priority: definition.priority,
          capabilities: definition.capabilities,
        });
        continue;
      }

      if (!this.registry.has(definition.provider_id)) continue;
      const adapter = this.registry.get(definition.provider_id);
      const externalEpisodeId = externalIds.get(definition.provider_id);
      if (!externalEpisodeId) continue;
      try {
        assertProviderHealthy(adapter.id);
        const resolved = await executeProviderResolution(adapter, {
          externalEpisodeId,
          externalSourceReference: definition.external_reference,
          purpose,
        }, { timeoutMs: this.timeoutMs, maxAttempts: 2 });
        for (const candidate of resolved) {
          const allowedHosts = [...new Set([...adapter.allowedHosts, ...definition.allowed_hosts])];
          const url = validatePlaybackUrl(candidate.url, {
            allowedHosts,
            allowedEmbedHosts: adapter.allowedEmbedHosts,
            allowRelativeUrls: adapter.allowRelativeUrls,
            isEmbed: candidate.type === 'embed',
          });
          candidates.push({ ...candidate, url, sourceDefinitionId: definition.id, episodeId, priority: definition.priority });
        }
        await recordProviderSuccess(adapter.id);
      } catch (error) {
        await recordProviderFailure(adapter.id, errorCode(error));
      }
    }

    const unique = [...new Map(candidates
      .sort((a, b) => a.priority - b.priority)
      .map((candidate) => [`${candidate.sourceDefinitionId}:${candidate.url}`, candidate])).values()];
    if (!unique.length) throw new ApplicationError('ALL_SOURCES_FAILED', 'No playable source is currently available.');
    return unique;
  }
}
