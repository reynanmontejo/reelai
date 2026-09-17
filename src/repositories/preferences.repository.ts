import type { UserPreferences } from '@/types/user-preferences';

export interface PreferencesRepository {
  get(): Promise<UserPreferences>;
  set(preferences: UserPreferences): Promise<void>;
  subscribe(listener: () => void): () => void;
}
