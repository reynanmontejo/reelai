import { getSupabaseClient } from '@/lib/supabase/client';
import type { UserPreferences } from '@/types/user-preferences';
import type { PreferencesRepository } from './preferences.repository';
import { getAuthenticatedUserId, subscribeToUserTable } from './supabase-user.repository';

export class SupabasePreferencesRepository implements PreferencesRepository {
  async get(): Promise<UserPreferences> {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await getSupabaseClient().from('user_preferences').select('autoplay').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { autoplay: data?.autoplay ?? true };
  }

  async set(preferences: UserPreferences) {
    const userId = await getAuthenticatedUserId();
    const { error } = await getSupabaseClient().from('user_preferences').upsert({ user_id: userId, autoplay: preferences.autoplay }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }

  subscribe(listener: () => void) { return subscribeToUserTable('user_preferences', listener); }
}
