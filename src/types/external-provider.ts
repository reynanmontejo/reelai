import type { StreamCapabilities, StreamPurpose, StreamType } from './stream';

export interface ExternalProviderCapabilities {
  catalog: boolean;
  search: boolean;
  episodes: boolean;
  mp4: boolean;
  webm: boolean;
  hls: boolean;
  embed: boolean;
  watch: boolean;
  feed: boolean;
  metadataSync: boolean;
  expiringUrls: boolean;
}

export interface ExternalAssetReference {
  url: string;
  usage: 'external-authorized' | 'external-reference' | 'importable' | 'owned';
  attribution?: string;
}

export interface ExternalSeries {
  externalId: string;
  slug: string;
  title: string;
  alternativeTitle?: string;
  description: string;
  poster: ExternalAssetReference;
  banner?: ExternalAssetReference;
  releaseYear?: number;
  status?: string;
  genres: string[];
  tags: string[];
  isAiOriginal?: boolean;
  badge?: string;
}

export interface ExternalSourceDefinition {
  externalReference?: string;
  purpose: StreamPurpose;
  priority: number;
  resolutionMode: 'static' | 'dynamic';
  type?: StreamType;
  url?: string;
  capabilities: StreamCapabilities;
  allowedHosts?: string[];
}

export interface ExternalEpisode {
  externalId: string;
  episodeNumber: number;
  title: string;
  description?: string;
  thumbnail?: ExternalAssetReference;
  durationSeconds?: number;
  releaseDate?: string;
  sources: ExternalSourceDefinition[];
}

export interface ResolveStreamRequest {
  externalEpisodeId: string;
  externalSourceReference?: string;
  purpose: Exclude<StreamPurpose, 'both'>;
}

export interface ResolvedPlaybackCandidate {
  sourceDefinitionId: string;
  episodeId: string;
  providerId: string;
  type: StreamType;
  url: string;
  priority: number;
  capabilities: StreamCapabilities;
  expiresAt?: string;
}

export interface ExternalProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ExternalProviderCapabilities;
  readonly allowedHosts: readonly string[];
  readonly allowedEmbedHosts?: readonly string[];
  readonly allowRelativeUrls?: boolean;

  search?(query: string): Promise<ExternalSeries[]>;
  getSeries(externalId: string): Promise<ExternalSeries>;
  getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]>;
  getSourceDefinitions?(externalEpisodeId: string): Promise<ExternalSourceDefinition[]>;
  resolveStreams(request: ResolveStreamRequest): Promise<Omit<ResolvedPlaybackCandidate, 'sourceDefinitionId' | 'episodeId' | 'priority'>[]>;
}

export interface ExternalCatalogImport {
  providerId: string;
  externalSeriesId: string;
  series: ExternalSeries;
  episodes: ExternalEpisode[];
}
