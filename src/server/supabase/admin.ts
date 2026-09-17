import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApplicationError } from '@/lib/application-error';

let client: SupabaseClient | undefined;

export function getServerSupabaseClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new ApplicationError('INVALID_BACKEND_CONFIGURATION', 'The server-side Supabase client is not configured.');
  }
  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
