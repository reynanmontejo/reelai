import type { WatchProgress } from '@/types/history';
import { migrateEpisodeId, migrateSeriesId } from '@/lib/internal-ids';

type LegacyProgress = { seriesSlug?: string; episodeNumber?: number; position?: number; duration?: number; completed?: boolean; updatedAt?: string };
type StoredDocument = { schemaVersion: 3; favorites: string[]; likes: string[]; preferences: { autoplay: boolean }; history: Record<string, WatchProgress> };
type VersionTwoDocument = Omit<StoredDocument, 'schemaVersion'> & { schemaVersion: 2 };
type LegacyDocument = { myList?: string[]; likes?: string[]; autoplay?: boolean; history?: Record<string, LegacyProgress> };

const STORAGE_KEY = 'reelai.local-state.v1';
const CHANGE_EVENT = 'reelai:storage-change';
const emptyDocument = (): StoredDocument => ({ schemaVersion: 3, favorites: [], likes: [], preferences: { autoplay: true }, history: {} });
const browserAvailable = () => typeof window !== 'undefined';

function migrateHistory(history: LegacyDocument['history']): Record<string, WatchProgress> {
  return Object.fromEntries(Object.entries(history || {}).map(([legacyKey, item]) => {
    const episodeId = legacyKey;
    const seriesId = item.seriesSlug || legacyKey.split(':').slice(0, -1).join(':');
    const migrated: WatchProgress = { episodeId, seriesId, positionSeconds: item.position || 0, durationSeconds: item.duration || 0, completed: Boolean(item.completed), updatedAt: item.updatedAt || new Date(0).toISOString() };
    return [episodeId, migrated];
  }));
}

function migrateInternalIds(document: VersionTwoDocument): StoredDocument {
  const history = Object.fromEntries(Object.values(document.history).map((item) => {
    const episodeId = migrateEpisodeId(item.episodeId);
    return [episodeId, { ...item, episodeId, seriesId: migrateSeriesId(item.seriesId) }];
  }));
  return {
    schemaVersion: 3,
    favorites: [...new Set(document.favorites.map(migrateSeriesId))],
    likes: [...new Set(document.likes.map(migrateEpisodeId))],
    preferences: document.preferences,
    history,
  };
}

function normalize(value: StoredDocument | VersionTwoDocument | LegacyDocument | null): StoredDocument {
  if (!value) return emptyDocument();
  if ('schemaVersion' in value && value.schemaVersion === 3) {
    return { schemaVersion: 3, favorites: Array.isArray(value.favorites) ? value.favorites : [], likes: Array.isArray(value.likes) ? value.likes : [], preferences: { autoplay: typeof value.preferences?.autoplay === 'boolean' ? value.preferences.autoplay : true }, history: value.history || {} };
  }
  if ('schemaVersion' in value && value.schemaVersion === 2) {
    return migrateInternalIds({ schemaVersion: 2, favorites: Array.isArray(value.favorites) ? value.favorites : [], likes: Array.isArray(value.likes) ? value.likes : [], preferences: { autoplay: typeof value.preferences?.autoplay === 'boolean' ? value.preferences.autoplay : true }, history: value.history || {} });
  }
  const legacy = value as LegacyDocument;
  return migrateInternalIds({ schemaVersion: 2, favorites: Array.isArray(legacy.myList) ? legacy.myList : [], likes: Array.isArray(legacy.likes) ? legacy.likes : [], preferences: { autoplay: typeof legacy.autoplay === 'boolean' ? legacy.autoplay : true }, history: migrateHistory(legacy.history) });
}

export const localStorageEngine = {
  read(): StoredDocument {
    if (!browserAvailable()) return emptyDocument();
    try { return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')); } catch { return emptyDocument(); }
  },
  update(updater: (document: StoredDocument) => StoredDocument) {
    if (!browserAvailable()) return;
    const next = updater(this.read());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  },
  subscribe(listener: () => void) {
    if (!browserAvailable()) return () => undefined;
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener('storage', listener);
    return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener('storage', listener); };
  },
};
