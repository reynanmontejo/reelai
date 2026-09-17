import { getSupabaseClient } from '@/lib/supabase/client';
import type { FavoritesRepository } from './favorites.repository';
import { getAuthenticatedUserId, subscribeToUserTable } from './supabase-user.repository';

export class SupabaseFavoritesRepository implements FavoritesRepository {
  async getAll() {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await getSupabaseClient().from('favorites').select('series_id').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return (data || []).map((row) => row.series_id as string);
  }

  async toggle(seriesId: string) {
    const userId = await getAuthenticatedUserId();
    const client = getSupabaseClient();
    const existing = await client.from('favorites').select('series_id').eq('user_id', userId).eq('series_id', seriesId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    const result = existing.data
      ? await client.from('favorites').delete().eq('user_id', userId).eq('series_id', seriesId)
      : await client.from('favorites').insert({ user_id: userId, series_id: seriesId });
    if (result.error) throw new Error(result.error.message);
  }

  subscribe(listener: () => void) { return subscribeToUserTable('favorites', listener); }
}
