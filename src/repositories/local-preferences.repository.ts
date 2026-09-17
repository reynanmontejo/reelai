import { localStorageEngine } from '@/lib/local-storage';
import type { UserPreferences } from '@/types/user-preferences';
import type { PreferencesRepository } from './preferences.repository';

export class LocalPreferencesRepository implements PreferencesRepository {
  async get() { return localStorageEngine.read().preferences; }
  async set(preferences: UserPreferences) { localStorageEngine.update((document) => ({ ...document, preferences })); }
  subscribe(listener: () => void) { return localStorageEngine.subscribe(listener); }
}
