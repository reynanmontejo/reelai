import { getExternalProviderRegistry } from '@/server/providers/external/registry';

async function main() {
  const [providerId, ...words] = process.argv.slice(2);
  if (!providerId) throw new Error('Usage: npm run provider:catalog -- <provider-id> [search words]');
  const provider = getExternalProviderRegistry().get(providerId);
  if (!provider.search) throw new Error('This provider does not support catalog search.');
  const results = await provider.search(words.join(' '));
  // Only selection metadata. Exclude credentials, complete payloads and signed artwork URLs.
  process.stdout.write(`${JSON.stringify(results.map(({ externalId, title, genres }) => ({ externalId, title, genres })), null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Catalog request failed.'}\n`);
  process.exitCode = 1;
});
