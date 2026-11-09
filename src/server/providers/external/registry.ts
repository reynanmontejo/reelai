import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalProviderAdapter } from '@/types/external-provider';
import { ApifyNetShortMetadataAdapter } from './apify-netshort.provider';
import { ApiShortMetadataAdapter } from './apishort.provider';
import { DemoExternalProviderAdapter } from './demo.provider';
import { DramaBosMetadataAdapter } from './dramabos.provider';
import { DramaFrenAuthorizedAdapter } from './dramafren.provider';
import { HuggingFaceDeepActionAdapter } from './huggingface-deepaction.provider';
import { WikimediaCommonsAiAdapter } from './wikimedia-commons.provider';
import { YouTubeEmbedAdapter } from './youtube-embed.provider';

const factories: Record<string, () => ExternalProviderAdapter> = {
  'apishort-metadata': () => new ApiShortMetadataAdapter(),
  'apify-netshort-metadata': () => new ApifyNetShortMetadataAdapter(),
  'dramabos-metadata': () => new DramaBosMetadataAdapter(),
  'reelai-demo': () => new DemoExternalProviderAdapter(),
  'dramafren-authorized': () => new DramaFrenAuthorizedAdapter(),
  'huggingface-deepaction': () => new HuggingFaceDeepActionAdapter(),
  'wikimedia-commons-ai': () => new WikimediaCommonsAiAdapter(),
  'youtube-embed': () => new YouTubeEmbedAdapter(),
};

export class ExternalProviderRegistry {
  private readonly adapters = new Map<string, ExternalProviderAdapter>();

  constructor(enabledProviderIds: string[] = []) {
    for (const id of enabledProviderIds) {
      const factory = factories[id];
      if (!factory) throw new ApplicationError('PROVIDER_NOT_FOUND', `Unknown configured external provider: ${id}`);
      this.adapters.set(id, factory());
    }
  }

  get(providerId: string) {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new ApplicationError('PROVIDER_NOT_FOUND', 'The requested provider is not enabled.', { context: { providerId } });
    return adapter;
  }

  has(providerId: string) {
    return this.adapters.has(providerId);
  }

  list() {
    return [...this.adapters.values()];
  }
}

function configuredProviderIds() {
  return (process.env.REELAI_EXTERNAL_PROVIDERS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

let registry: ExternalProviderRegistry | undefined;

export function getExternalProviderRegistry() {
  registry ??= new ExternalProviderRegistry(configuredProviderIds());
  return registry;
}

export function createExternalProviderRegistry(enabledProviderIds: string[]) {
  return new ExternalProviderRegistry(enabledProviderIds);
}
