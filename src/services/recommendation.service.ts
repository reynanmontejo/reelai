import type { Episode } from '@/types/episode';
import type { Series } from '@/types/series';

export interface ReelRecommendationInput {
  currentEpisode: Episode;
  currentSeries: Series;
  completionPercentage: number;
  watchedSeconds: number;
  nextEpisodeInSeries: Episode | null;
  differentSeriesCandidates: Array<{ series: Series; episode: Episode }>;
}

export class RecommendationService {
  recommendNext(input: ReelRecommendationInput): { series: Series; episode: Episode } | null {
    if (input.completionPercentage >= 0.7 && input.nextEpisodeInSeries) return { series: input.currentSeries, episode: input.nextEpisodeInSeries };
    const skippedEarly = input.watchedSeconds <= 5 || input.completionPercentage < 0.2;
    if (skippedEarly) return input.differentSeriesCandidates.find((candidate) => candidate.series.id !== input.currentSeries.id) || null;
    return input.nextEpisodeInSeries ? { series: input.currentSeries, episode: input.nextEpisodeInSeries } : input.differentSeriesCandidates[0] || null;
  }
}
