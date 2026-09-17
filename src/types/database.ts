import type { StreamCapabilities, StreamType } from './stream';

export interface DatabaseSeriesRow {
  id: string;
  slug: string;
  title: string;
  alternative_title: string | null;
  description: string;
  poster_url: string;
  banner_url: string | null;
  release_year: number | null;
  status: 'ongoing' | 'completed' | 'upcoming' | null;
  episode_count: number;
  genres: string[];
  tags: string[];
  is_ai_original: boolean;
  badge: string | null;
}

export interface DatabaseEpisodeRow {
  id: string;
  series_id: string;
  episode_number: number;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  release_date: string | null;
}

export interface DatabaseStreamSourceRow {
  id: string;
  episode_id: string;
  provider: string;
  stream_type: StreamType;
  stream_purpose: 'watch' | 'feed' | 'both';
  url: string;
  priority: number;
  is_active: boolean;
  capabilities: StreamCapabilities;
}

export interface DatabaseWatchHistoryRow {
  user_id: string;
  episode_id: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
}
