import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';

const HOST = 'huggingface.co';
const DATASET_ID = 'faridlab/deepaction_v1';
const CACHE_TTL_MS = 10 * 60_000;
const MAX_RESPONSE_BYTES = 100_000;

export interface DeepActionDatasetStatus {
  revision: string;
  license: 'CC BY 4.0';
}

export interface DeepActionClientLike {
  verifyDataset(): Promise<DeepActionDatasetStatus>;
}

function assertResponseSize(response: Response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_RESPONSE_BYTES) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Hugging Face returned an oversized metadata response.');
  }
}

async function readBounded(response: Response) {
  assertResponseSize(response);
  const value = await response.text();
  if (value.length > MAX_RESPONSE_BYTES) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Hugging Face returned an oversized metadata response.');
  }
  return value;
}

export class HuggingFaceDeepActionClient implements DeepActionClientLike {
  private cached?: { expiresAt: number; value: DeepActionDatasetStatus };
  private inFlight?: Promise<DeepActionDatasetStatus>;

  async verifyDataset() {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchStatus().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async fetchStatus(): Promise<DeepActionDatasetStatus> {
    const [metadataResponse, readmeResponse] = await Promise.all([
      safeProviderFetch(`https://${HOST}/api/datasets/${DATASET_ID}?expand[]=private&expand[]=gated&expand[]=disabled&expand[]=sha`, {
        allowedHosts: [HOST], timeoutMs: 10_000,
        init: { headers: { Accept: 'application/json', 'User-Agent': 'ReelAI-Development/0.1 (licensed dataset integration)' } },
      }),
      safeProviderFetch(`https://${HOST}/datasets/${DATASET_ID}/raw/main/README.md`, {
        allowedHosts: [HOST], timeoutMs: 10_000,
        init: { headers: { Accept: 'text/plain', 'User-Agent': 'ReelAI-Development/0.1 (licensed dataset integration)' } },
      }),
    ]);
    if (metadataResponse.status === 429 || readmeResponse.status === 429) {
      throw new ApplicationError('PROVIDER_RATE_LIMITED', 'Hugging Face rate limited the dataset request.');
    }
    if (!metadataResponse.ok || !readmeResponse.ok) {
      throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The DeepAction dataset is temporarily unavailable.');
    }
    const [metadataText, readme] = await Promise.all([readBounded(metadataResponse), readBounded(readmeResponse)]);
    let metadata: unknown;
    try {
      metadata = JSON.parse(metadataText);
    } catch (cause) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Hugging Face returned invalid dataset metadata.', { cause });
    }
    const row = metadata as { id?: unknown; private?: unknown; gated?: unknown; disabled?: unknown; sha?: unknown };
    if (row.id !== DATASET_ID || row.private !== false || Boolean(row.gated) || Boolean(row.disabled) || typeof row.sha !== 'string') {
      throw new ApplicationError('SOURCE_FORBIDDEN', 'The DeepAction dataset is no longer publicly available for this integration.');
    }
    if (!/AI-generated videos[\s\S]{0,250}CC BY 4\.0 license/i.test(readme)) {
      throw new ApplicationError('SOURCE_FORBIDDEN', 'The DeepAction AI-video license statement could not be verified.');
    }
    const value = { revision: row.sha, license: 'CC BY 4.0' as const };
    this.cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }
}

export function deepActionVideoUrl(path: string) {
  if (!/^RunwayML\/37\/[a-e]\.mp4$/.test(path)) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'The requested DeepAction video is outside the curated collection.');
  }
  return `https://${HOST}/datasets/${DATASET_ID}/resolve/main/${path}`;
}
