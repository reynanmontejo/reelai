import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const browserOutput = join(process.cwd(), '.next', 'static');
const protectedNames = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'PROVIDER_API_SECRET',
  'PROVIDER_AUTHORIZATION_TOKEN',
  'IMPORT_WEBHOOK_SECRET',
  'APIFY_API_TOKEN',
];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesBelow(join(directory, entry.name))
    : [join(directory, entry.name)]))).flat();
}

const files = await filesBelow(browserOutput);
if (!files.length) {
  throw new Error('Client secret exposure check could not run because no browser build files were found. Run npm run build first.');
}
const texts = await Promise.all(files
  .filter((file) => ['.js', '.json', '.map', '.css'].includes(extname(file)))
  .map((file) => readFile(file, 'utf8')));
const bundle = texts.join('\n');
const exposedNames = protectedNames.filter((name) => bundle.includes(name));
const exposedValues = protectedNames.filter((name) => {
  const value = process.env[name];
  return value && value.length >= 8 && bundle.includes(value);
});

if (exposedNames.length || exposedValues.length) {
  throw new Error(`Client secret exposure check failed for: ${[...new Set([...exposedNames, ...exposedValues])].join(', ')}`);
}
process.stdout.write(`Client secret exposure check passed across ${files.length} browser build files.\n`);
