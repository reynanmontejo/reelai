export interface WatchProgress {
  episodeId: string;
  seriesId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: string;
}

export interface SaveProgressInput {
  episodeId: string;
  seriesId: string;
  positionSeconds: number;
  durationSeconds: number;
}
