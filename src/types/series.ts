export interface Series {
  id: string;
  slug: string;
  title: string;
  alternativeTitle?: string;
  description: string;
  posterUrl: string;
  bannerUrl?: string;
  releaseYear?: number;
  status?: 'ongoing' | 'completed' | 'upcoming';
  episodeCount: number;
  genres: string[];
  tags?: string[];
  isAiOriginal?: boolean;
  badge?: string;
}
