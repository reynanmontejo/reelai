import { ApplicationError } from '@/lib/application-error';
import { CatalogImporter } from '@/server/import/catalog-importer';
import { ApiShortClient, type ApiShortTitle } from '@/server/providers/external/apishort.client';
import { ApiShortMetadataAdapter } from '@/server/providers/external/apishort.provider';
import { getServerSupabaseClient } from '@/server/supabase/admin';

function positiveOption(name: string, fallback: number, maximum: number) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? fallback : Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}; use 1–${maximum}.`);
  return value;
}

async function main() {
  const maxRequests = positiveOption('--max-requests', 40, 90);
  const maxPages = positiveOption('--max-pages', 3, 10);
  const publish = process.argv.includes('--publish');
  const db = getServerSupabaseClient();
  const existing = await db.from('provider_references').select('external_id').eq('provider', 'apishort-metadata').eq('entity_type', 'series');
  if (existing.error) throw new Error('Could not read existing import references.');
  const known = new Set((existing.data as Array<{ external_id: string }>).map(row => row.external_id));
  const client = new ApiShortClient();
  const titles = new Map<string, ApiShortTitle>();
  let requests = 0;
  let lastRequest = 0;
  async function request<T>(task: () => Promise<T>) {
    if (requests >= maxRequests) throw new Error('REQUEST_BUDGET');
    const delay = Math.max(0, lastRequest + 1_000 - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    requests++; lastRequest = Date.now();
    return task();
  }
  for (let page = 1; page <= maxPages && requests < maxRequests; page++) {
    const rows = await request(() => client.getCatalogPage(page));
    let added = 0;
    for (const row of rows) if (!titles.has(row.externalId)) { titles.set(row.externalId, row); added++; }
    console.log(JSON.stringify({ stage: 'catalog', page, uniqueTitles: rows.length, newTitles: added }));
    if (!added) break;
  }
  // Validated discovery metadata supplies the series fields. Each new title
  // needs one alleps call, rather than another detail + playback request.
  const adapter = new ApiShortMetadataAdapter({
    async getCatalog() { return [...titles.values()]; },
    async getSeries(id) { const title = titles.get(id); if (!title) throw new Error('Unknown discovered title.'); return title; },
    getEpisodes: id => request(() => client.getImportEpisodes(id)),
    getPlayback: id => client.getPlayback(id),
  });
  const importer = new CatalogImporter({ get: id => { if (id !== adapter.id) throw new Error('Unsupported batch provider.'); return adapter; } });
  let imported = 0; let episodes = 0; let skipped = 0;
  let consecutiveUnavailable = 0;
  const failures: Array<{ externalId: string; code: string }> = [];
  let stopped = 'catalog_exhausted';
  for (const title of titles.values()) {
    if (known.has(title.externalId)) { skipped++; continue; }
    if (requests >= maxRequests) { stopped = 'request_budget'; break; }
    try {
      const result = await importer.import(adapter.id, title.externalId, { publish });
      consecutiveUnavailable = 0;
      known.add(title.externalId); imported++; episodes += result.episodeCount;
      console.log(JSON.stringify({ stage: 'imported', externalId: title.externalId, title: title.title, episodeCount: result.episodeCount, requests }));
    } catch (error) {
      const code = error instanceof ApplicationError ? error.code : 'IMPORT_FAILED';
      failures.push({ externalId: title.externalId, code });
      console.log(JSON.stringify({ stage: 'skipped', externalId: title.externalId, code, requests }));
      consecutiveUnavailable = code === 'PROVIDER_UNAVAILABLE' ? consecutiveUnavailable + 1 : 0;
      if (['PROVIDER_RATE_LIMITED', 'SOURCE_FORBIDDEN', 'CATALOG_UNAVAILABLE'].includes(code) || consecutiveUnavailable >= 3) { stopped = code; break; }
    }
  }
  console.log(JSON.stringify({ stage: 'summary', discovered: titles.size, imported, episodes, existingSkipped: skipped, failed: failures.length, requests, maxRequests, stopped, published: publish }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof ApplicationError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : 'Batch import failed.');
  process.exitCode = 1;
});
