import type { Episode } from '@/types/episode';
import type { ProviderReference } from '@/types/provider';
import type { Series } from '@/types/series';
import type { StreamSource } from '@/types/stream';
import { episodeIdFor, SERIES_IDS_BY_SLUG } from '@/lib/internal-ids';

const poster = (number: number) => `/images/poster-${number}.svg`;

const mockSeriesData = [
  { id: 'the-ceos-second-chance', slug: 'the-ceos-second-chance', title: "The CEO's Second Chance", description: "After a painful breakup, she unexpectedly reunites with her cold CEO ex—but this time, he's the one changing.", posterUrl: poster(1), releaseYear: 2026, status: 'ongoing', episodeCount: 50, genres: ['Romance', 'Drama'], tags: ['Second chance', 'Slow burn', 'Secrets'], isAiOriginal: true, badge: 'AI ORIGINAL' },
  { id: 'my-ai-boyfriend', slug: 'my-ai-boyfriend', title: 'My AI Boyfriend', description: 'A lonely engineer builds the perfect companion, then discovers he remembers a life he never lived.', posterUrl: poster(2), releaseYear: 2026, status: 'ongoing', episodeCount: 30, genres: ['Sci-Fi', 'Romance'], tags: ['Artificial intelligence', 'Memory'], badge: 'TRENDING' },
  { id: 'bound-by-revenge', slug: 'bound-by-revenge', title: 'Bound by Revenge', description: 'She returned to take back an empire. Falling for its heir was never part of the plan.', posterUrl: poster(3), releaseYear: 2026, status: 'ongoing', episodeCount: 42, genres: ['Drama'], tags: ['Revenge', 'Empire'] },
  { id: 'moonlit-oath', slug: 'moonlit-oath', title: 'Moonlit Oath', description: 'An immortal warrior and a royal seer are bound by a forbidden promise.', posterUrl: poster(4), releaseYear: 2025, status: 'completed', episodeCount: 36, genres: ['Fantasy'], tags: ['Immortal', 'Royal'] },
  { id: 'the-perfect-alibi', slug: 'the-perfect-alibi', title: 'The Perfect Alibi', description: 'Every witness saw him leave. Every camera says he stayed.', posterUrl: poster(5), releaseYear: 2026, status: 'ongoing', episodeCount: 24, genres: ['Mystery'], tags: ['Crime', 'Secrets'] },
  { id: 'stolen-crown', slug: 'stolen-crown', title: 'Stolen Crown', description: 'A servant with a royal secret risks everything to reclaim her name.', posterUrl: poster(6), releaseYear: 2025, status: 'completed', episodeCount: 48, genres: ['Historical'], tags: ['Royal', 'Identity'] },
  { id: 'neon-hearts', slug: 'neon-hearts', title: 'Neon Hearts', description: 'Love is illegal in the city of tomorrow.', posterUrl: poster(7), releaseYear: 2026, status: 'ongoing', episodeCount: 32, genres: ['Sci-Fi'], tags: ['Dystopia', 'Forbidden love'] },
  { id: 'contracted-to-love', slug: 'contracted-to-love', title: 'Contracted to Love', description: 'A six-month contract. One rule: do not fall in love.', posterUrl: poster(8), releaseYear: 2026, status: 'ongoing', episodeCount: 40, genres: ['Romance'], tags: ['Contract', 'Slow burn'] },
] satisfies Series[];

export const mockSeriesSeed: Series[] = mockSeriesData.map((series) => ({ ...series, id: SERIES_IDS_BY_SLUG[series.slug] }));

const titles = ['A Familiar Stranger', 'Unexpected Encounter', 'The Proposal', 'Old Wounds', 'A New Deal', 'Hidden Truths', 'The Gala', 'No Way Back', 'What We Lost', 'The Choice', 'Second Chances', 'Begin Again'];
export const mockEpisodeSeed: Episode[] = mockSeriesSeed.flatMap((series, seriesIndex) => titles.map((title, index) => ({ id: episodeIdFor(seriesIndex + 1, index + 1), seriesId: series.id, episodeNumber: index + 1, title, description: `${title}, episode ${index + 1} of ${series.title}.`, thumbnailUrl: series.posterUrl, durationSeconds: 124 + (index * 7) % 50 })));

const mp4Samples = ['/videos/reel-1.mp4', '/videos/reel-2.mp4', '/videos/reel-3.mp4'];
const nativeCapabilities = { progressTracking: true, seek: true, pictureInPicture: true, playbackRate: true };
const embedCapabilities = { progressTracking: false, seek: false, pictureInPicture: false, playbackRate: false };

export const mockStreamSeed: StreamSource[] = mockEpisodeSeed.map((episode) => {
  const seriesIndex = Math.max(0, mockSeriesSeed.findIndex((series) => series.id === episode.seriesId));
  if (episode.episodeNumber === 2) return { id: `stream:${episode.id}:hls`, episodeId: episode.id, provider: 'Mux test stream', type: 'hls', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', priority: 1, isActive: true, capabilities: nativeCapabilities };
  if (episode.episodeNumber === 3) return { id: `stream:${episode.id}:embed`, episodeId: episode.id, provider: 'Authorized demo embed', type: 'embed', url: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0', priority: 1, isActive: true, capabilities: embedCapabilities };
  return { id: `stream:${episode.id}:mp4`, episodeId: episode.id, provider: 'Bundled CC0 demo media', type: 'mp4', url: mp4Samples[(seriesIndex + episode.episodeNumber) % mp4Samples.length], priority: 1, isActive: true, capabilities: nativeCapabilities };
});

export const mockFeedStreamSeed: StreamSource[] = mockEpisodeSeed.map((episode) => {
  const seriesIndex = Math.max(0, mockSeriesSeed.findIndex((series) => series.id === episode.seriesId));
  return { id: `feed:${episode.id}:mp4`, episodeId: episode.id, provider: 'Bundled CC0 demo media', type: 'mp4', url: mp4Samples[(seriesIndex + episode.episodeNumber) % mp4Samples.length], priority: 1, isActive: true, capabilities: nativeCapabilities };
});

export const mockProviderReferences: ProviderReference[] = [
  ...mockSeriesSeed.map((series, index) => ({ id: `mock:series:${index + 1}`, provider: 'MockContent', entityType: 'series' as const, internalId: series.id, externalId: `mock-series-${index + 1}` })),
  ...mockEpisodeSeed.map((episode, index) => ({ id: `mock:episode:${index + 1}`, provider: 'MockContent', entityType: 'episode' as const, internalId: episode.id, externalId: `mock-episode-${index + 1}` })),
];
