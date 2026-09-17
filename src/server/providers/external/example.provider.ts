import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest, ResolvedPlaybackCandidate } from '@/types/external-provider';

/**
 * Copy this template only after documenting authorization in docs/ADDING_PROVIDER.md.
 * Keep credentials in non-public environment variables and never register an
 * incomplete adapter in the production provider allowlist.
 */
export class ExampleExternalProviderAdapter implements ExternalProviderAdapter {
  readonly id = 'example-provider';
  readonly name = 'Example authorized provider';
  readonly allowedHosts = ['api.provider.example', 'media.provider.example'] as const;
  readonly allowedEmbedHosts = ['embed.provider.example'] as const;
  readonly capabilities = {
    catalog: true, search: false, episodes: true, mp4: true, webm: false, hls: true,
    embed: true, watch: true, feed: true, metadataSync: true, expiringUrls: true,
  } as const;

  private get apiKey() {
    const value = process.env.EXAMPLE_PROVIDER_API_SECRET;
    if (!value) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The example provider is not configured.');
    return value;
  }

  private async request(path: string) {
    const response = await safeProviderFetch(`https://api.provider.example/${path}`, {
      allowedHosts: this.allowedHosts,
      timeoutMs: 8_000,
      init: { headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' } },
    });
    if (response.status === 429) throw new ApplicationError('PROVIDER_RATE_LIMITED', 'The provider rate limit was reached.');
    if (response.status === 403) throw new ApplicationError('SOURCE_FORBIDDEN', 'The provider refused this request.');
    if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The provider request failed.');
    return response.json() as Promise<unknown>;
  }

  async getSeries(externalId: string): Promise<ExternalSeries> {
    await this.request(`series/${encodeURIComponent(externalId)}`);
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Implement documented series normalization before enabling this adapter.');
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    await this.request(`series/${encodeURIComponent(externalSeriesId)}/episodes`);
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Implement documented episode normalization before enabling this adapter.');
  }

  async resolveStreams(request: ResolveStreamRequest): Promise<Omit<ResolvedPlaybackCandidate, 'sourceDefinitionId' | 'episodeId' | 'priority'>[]> {
    await this.request(`episodes/${encodeURIComponent(request.externalEpisodeId)}/streams?purpose=${request.purpose}`);
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Implement documented stream normalization before enabling this adapter.');
  }
}
