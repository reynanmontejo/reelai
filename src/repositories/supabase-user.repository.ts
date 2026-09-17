import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function getAuthenticatedUserId() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error || !data.user) throw new Error(error?.message || 'Authentication is required for synchronized user data.');
  return data.user.id;
}

export function subscribeToUserTable(table: string, listener: () => void) {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  void getAuthenticatedUserId().then((userId) => {
    if (cancelled) return;
    channel = getSupabaseClient()
      .channel(`reelai:${table}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, listener)
      .subscribe();
  }).catch(() => undefined);
  return () => {
    cancelled = true;
    if (channel) void getSupabaseClient().removeChannel(channel);
  };
}
