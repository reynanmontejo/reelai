import { getSupabaseClient } from '@/lib/supabase/client';
import type { SaveProgressInput, WatchProgress } from '@/types/history';
import type { HistoryRepository } from './history.repository';
import { getAuthenticatedUserId, subscribeToUserTable } from './supabase-user.repository';

type HistoryResultRow = {
  episode_id: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
  episodes: { series_id: string } | Array<{ series_id: string }>;
};

const mapHistory = (row: HistoryResultRow): WatchProgress => ({
  episodeId: row.episode_id,
  seriesId: Array.isArray(row.episodes) ? row.episodes[0]?.series_id : row.episodes.series_id,
  positionSeconds: row.position_seconds,
  durationSeconds: row.duration_seconds,
  completed: row.completed,
  updatedAt: row.updated_at,
});

export class SupabaseHistoryRepository implements HistoryRepository {
  async getAll() {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await getSupabaseClient().from('watch_history').select('episode_id, position_seconds, duration_seconds, completed, updated_at, episodes!inner(series_id)').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return ((data || []) as unknown as HistoryResultRow[]).map(mapHistory);
  }

  async getByEpisodeId(episodeId: string) {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await getSupabaseClient().from('watch_history').select('episode_id, position_seconds, duration_seconds, completed, updated_at, episodes!inner(series_id)').eq('user_id', userId).eq('episode_id', episodeId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapHistory(data as unknown as HistoryResultRow) : null;
  }

  async saveProgress(input: SaveProgressInput) {
    const userId = await getAuthenticatedUserId();
    const completed = input.durationSeconds > 0 && input.positionSeconds / input.durationSeconds >= 0.9;
    const { error } = await getSupabaseClient().from('watch_history').upsert({ user_id: userId, episode_id: input.episodeId, position_seconds: input.positionSeconds, duration_seconds: input.durationSeconds, completed }, { onConflict: 'user_id,episode_id' });
    if (error) throw new Error(error.message);
  }

  subscribe(listener: () => void) { return subscribeToUserTable('watch_history', listener); }
}
