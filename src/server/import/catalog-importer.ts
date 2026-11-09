import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { getExternalProviderRegistry, type ExternalProviderRegistry } from '@/server/providers/external/registry';
import { validatePlaybackUrl } from '@/server/security/url-policy';
import { getServerSupabaseClient } from '@/server/supabase/admin';
import type { ExternalCatalogImport, ExternalEpisode, ExternalSeries } from '@/types/external-provider';

export type ImportOptions = { publish?: boolean; dryRun?: boolean };
export type ImportResult = {
  providerId: string;
  externalSeriesId: string;
  seriesId?: string;
  episodeCount: number;
  createdCount: number;
  updatedCount: number;
  dryRun: boolean;
};

function validateSeries(series: ExternalSeries) {
  if (!series.externalId || !series.slug || !series.title || !series.poster?.url || !Array.isArray(series.genres)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'The provider returned invalid series metadata.');
  }
}

function validateEpisodes(episodes: ExternalEpisode[]) {
  const externalIds = new Set<string>();
  const episodeNumbers = new Set<number>();
  for (const episode of episodes) {
    if (!episode.externalId || !Number.isInteger(episode.episodeNumber) || episode.episodeNumber < 1 || !episode.title) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'The provider returned invalid episode metadata.');
    }
    if (externalIds.has(episode.externalId) || episodeNumbers.has(episode.episodeNumber)) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'The provider returned duplicate episode identity.');
    }
    externalIds.add(episode.externalId);
    episodeNumbers.add(episode.episodeNumber);
  }
}

export class CatalogImporter {
  constructor(private readonly registry: Pick<ExternalProviderRegistry, 'get'> = getExternalProviderRegistry()) {}

  async prepare(providerId: string, externalSeriesId: string): Promise<ExternalCatalogImport> {
    const adapter = this.registry.get(providerId);
    const [series, episodes] = await Promise.all([
      adapter.getSeries(externalSeriesId),
      adapter.getEpisodes(externalSeriesId),
    ]);
    validateSeries(series);
    validateEpisodes(episodes);
    for (const episode of episodes) {
      for (const source of episode.sources) {
        if (source.resolutionMode === 'static') {
          if (!source.type || !source.url) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'A static source is missing its type or URL.');
          validatePlaybackUrl(source.url, {
            allowedHosts: [...new Set([...adapter.allowedHosts, ...(source.allowedHosts || [])])],
            allowedEmbedHosts: adapter.allowedEmbedHosts,
            allowRelativeUrls: adapter.allowRelativeUrls,
            isEmbed: source.type === 'embed',
          });
        }
      }
    }
    return { providerId, externalSeriesId, series, episodes };
  }

  async import(providerId: string, externalSeriesId: string, options: ImportOptions = {}): Promise<ImportResult> {
    // Provider I/O and normalization intentionally finish before the atomic database RPC begins.
    const catalog = await this.prepare(providerId, externalSeriesId);
    if (options.dryRun) return {
      providerId,
      externalSeriesId,
      episodeCount: catalog.episodes.length,
      createdCount: 0,
      updatedCount: 0,
      dryRun: true,
    };

    const client = getServerSupabaseClient();
    const job = await client.from('provider_import_jobs').insert({
      provider_id: providerId,
      external_series_id: externalSeriesId,
      status: 'running',
    }).select('id').single();
    if (job.error) throw new ApplicationError('CATALOG_UNAVAILABLE', 'Unable to create the import job.', { cause: job.error });

    try {
      const result = await client.rpc('import_external_catalog', {
        catalog,
        publish_content: Boolean(options.publish),
      });
      if (result.error) throw new ApplicationError('CATALOG_UNAVAILABLE', 'The catalog import transaction failed.', { cause: result.error });
      const data = result.data as { seriesId: string; episodeCount: number; createdCount: number; updatedCount: number };
      await client.from('provider_import_jobs').update({
        status: 'succeeded',
        created_count: data.createdCount,
        updated_count: data.updatedCount,
        finished_at: new Date().toISOString(),
      }).eq('id', job.data.id);
      return { providerId, externalSeriesId, ...data, dryRun: false };
    } catch (error) {
      await client.from('provider_import_jobs').update({
        status: 'failed',
        error_type: error instanceof ApplicationError ? error.code : 'CATALOG_UNAVAILABLE',
        finished_at: new Date().toISOString(),
      }).eq('id', job.data.id);
      throw error;
    }
  }
}
