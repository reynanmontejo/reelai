export interface Episode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  releaseDate?: string;
}
