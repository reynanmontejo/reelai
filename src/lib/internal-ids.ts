export const SERIES_IDS_BY_SLUG: Readonly<Record<string, string>> = {
  'the-ceos-second-chance': '10000000-0000-4000-8000-000000000001',
  'my-ai-boyfriend': '10000000-0000-4000-8000-000000000002',
  'bound-by-revenge': '10000000-0000-4000-8000-000000000003',
  'moonlit-oath': '10000000-0000-4000-8000-000000000004',
  'the-perfect-alibi': '10000000-0000-4000-8000-000000000005',
  'stolen-crown': '10000000-0000-4000-8000-000000000006',
  'neon-hearts': '10000000-0000-4000-8000-000000000007',
  'contracted-to-love': '10000000-0000-4000-8000-000000000008',
};

export function episodeIdFor(seriesIndex: number, episodeNumber: number) {
  const suffix = String(seriesIndex * 100 + episodeNumber).padStart(12, '0');
  return `20000000-0000-4000-8000-${suffix}`;
}

export function migrateSeriesId(value: string) {
  return SERIES_IDS_BY_SLUG[value] || value;
}

export function migrateEpisodeId(value: string) {
  const separator = value.lastIndexOf(':');
  if (separator < 0) return value;
  const slug = value.slice(0, separator);
  const episodeNumber = Number(value.slice(separator + 1));
  const seriesId = SERIES_IDS_BY_SLUG[slug];
  const seriesIndex = Object.keys(SERIES_IDS_BY_SLUG).indexOf(slug) + 1;
  return seriesId && Number.isInteger(episodeNumber) && episodeNumber > 0 && seriesIndex > 0
    ? episodeIdFor(seriesIndex, episodeNumber)
    : value;
}
