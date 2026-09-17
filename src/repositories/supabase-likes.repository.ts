import { getSupabaseClient } from '@/lib/supabase/client';
import type { LikesRepository } from './likes.repository';
import { getAuthenticatedUserId, subscribeToUserTable } from './supabase-user.repository';

export class SupabaseLikesRepository implements LikesRepository {
  async getAll() {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await getSupabaseClient().from('episode_likes').select('episode_id').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return (data || []).map((row) => row.episode_id as string);
  }

  async toggle(episodeId: string) {
    const userId = await getAuthenticatedUserId();
    const client = getSupabaseClient();
    const existing = await client.from('episode_likes').select('episode_id').eq('user_id', userId).eq('episode_id', episodeId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    const result = existing.data
      ? await client.from('episode_likes').delete().eq('user_id', userId).eq('episode_id', episodeId)
      : await client.from('episode_likes').insert({ user_id: userId, episode_id: episodeId });
    if (result.error) throw new Error(result.error.message);
  }

  subscribe(listener: () => void) { return subscribeToUserTable('episode_likes', listener); }
}
