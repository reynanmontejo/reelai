import { CatalogImporter } from '@/server/import/catalog-importer';

function usage(): never {
  throw new Error('Usage: npm run provider:import -- <provider-id> <external-series-id> [--dry-run] [--publish]');
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const [providerId, externalSeriesId] = positional;
  if (!providerId || !externalSeriesId) usage();

  const result = await new CatalogImporter().import(providerId, externalSeriesId, {
    dryRun: args.includes('--dry-run'),
    publish: args.includes('--publish'),
  });

  // Safe operational summary only: no provider payloads, credentials, or playback URLs.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Provider import failed.'}\n`);
  process.exitCode = 1;
});
