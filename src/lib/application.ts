import { MockContentProvider } from '@/providers/mock.provider';
import { SupabaseContentProvider } from '@/providers/supabase.provider';
import { ProviderEpisodeRepository } from '@/repositories/episode.repository';
import { LocalFavoritesRepository } from '@/repositories/local-favorites.repository';
import { LocalHistoryRepository } from '@/repositories/local-history.repository';
import { LocalLikesRepository } from '@/repositories/local-likes.repository';
import { LocalPreferencesRepository } from '@/repositories/local-preferences.repository';
import { ProviderSeriesRepository } from '@/repositories/series.repository';
import { ProviderStreamRepository } from '@/repositories/stream.repository';
import { EpisodeService } from '@/services/episode.service';
import { FavoritesService } from '@/services/favorites.service';
import { HistoryService } from '@/services/history.service';
import { LikesService } from '@/services/likes.service';
import { PreferencesService } from '@/services/preferences.service';
import { RecommendationService } from '@/services/recommendation.service';
import { SeriesService } from '@/services/series.service';
import { StreamService } from '@/services/stream.service';
import { ApplicationError } from '@/lib/application-error';
import type { ContentProvider } from '@/types/provider';

function createContentProvider(): ContentProvider {
  const backend = process.env.NEXT_PUBLIC_REELAI_CONTENT_BACKEND || 'mock';
  if (backend === 'mock') return new MockContentProvider();
  if (backend === 'supabase') return new SupabaseContentProvider();
  throw new ApplicationError('INVALID_BACKEND_CONFIGURATION', `Unsupported ReelAI content backend: ${backend}`);
}

const provider = createContentProvider();
const seriesRepository = new ProviderSeriesRepository(provider);
const episodeRepository = new ProviderEpisodeRepository(provider);
const streamRepository = new ProviderStreamRepository(provider);
const favoritesRepository = new LocalFavoritesRepository();
const historyRepository = new LocalHistoryRepository();
const likesRepository = new LocalLikesRepository();
const preferencesRepository = new LocalPreferencesRepository();

export const seriesService = new SeriesService(seriesRepository);
export const episodeService = new EpisodeService(episodeRepository);
export const streamService = new StreamService(streamRepository);
export const historyService = new HistoryService(historyRepository);
export const favoritesService = new FavoritesService(favoritesRepository, seriesRepository);
export const likesService = new LikesService(likesRepository);
export const preferencesService = new PreferencesService(preferencesRepository);
export const recommendationService = new RecommendationService();
export const contentBackend = provider.name;
