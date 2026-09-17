import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { getServerSupabaseClient } from '@/server/supabase/admin';

type Health = { consecutiveFailures: number; cooldownUntil?: number };
const health = new Map<string, Health>();
const failureThreshold = 3;
const cooldownMs = 30_000;

export function assertProviderHealthy(providerId: string, now = Date.now()) {
  const current = health.get(providerId);
  if (current?.cooldownUntil && current.cooldownUntil > now) {
    throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The provider is temporarily cooling down.', { context: { providerId } });
  }
}

export async function recordProviderSuccess(providerId: string) {
  health.set(providerId, { consecutiveFailures: 0 });
  await getServerSupabaseClient().from('external_provider_health').upsert({
    provider_id: providerId,
    last_success_at: new Date().toISOString(),
    consecutive_failures: 0,
    last_error_type: null,
    cooldown_until: null,
  }, { onConflict: 'provider_id' });
}

export async function recordProviderFailure(providerId: string, errorType: string) {
  const consecutiveFailures = (health.get(providerId)?.consecutiveFailures || 0) + 1;
  const cooldownUntil = consecutiveFailures >= failureThreshold ? Date.now() + cooldownMs : undefined;
  health.set(providerId, { consecutiveFailures, cooldownUntil });
  await getServerSupabaseClient().from('external_provider_health').upsert({
    provider_id: providerId,
    last_failure_at: new Date().toISOString(),
    consecutive_failures: consecutiveFailures,
    last_error_type: errorType,
    cooldown_until: cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
  }, { onConflict: 'provider_id' });
}

export function resetProviderHealthForTests() {
  health.clear();
}
