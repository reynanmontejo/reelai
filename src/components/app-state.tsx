'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { favoritesService, historyService, likesService, preferencesService } from '@/lib/application';
import type { WatchProgress } from '@/types/history';

type AppStateValue = { favoriteIds: string[]; likedEpisodeIds: string[]; autoplay: boolean; history: Record<string, WatchProgress>; hydrated: boolean; toggleFavorite: (seriesId: string) => void; toggleLike: (episodeId: string) => void; setAutoplay: (enabled: boolean) => void };
const initial: AppStateValue = { favoriteIds: [], likedEpisodeIds: [], autoplay: true, history: {}, hydrated: false, toggleFavorite: () => undefined, toggleLike: () => undefined, setAutoplay: () => undefined };
const AppStateContext = createContext<AppStateValue>(initial);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ favoriteIds: [] as string[], likedEpisodeIds: [] as string[], autoplay: true, history: {} as Record<string, WatchProgress> });
  const [hydrated, setHydrated] = useState(false);
  const syncScheduled = useRef(false);
  const sync = useCallback(async () => { const [favoriteIds, likedEpisodeIds, preferences, historyItems] = await Promise.all([favoritesService.getIds(), likesService.getIds(), preferencesService.get(), historyService.getHistory()]); setState({ favoriteIds, likedEpisodeIds, autoplay: preferences.autoplay, history: Object.fromEntries(historyItems.map((item) => [item.episodeId, item])) }); setHydrated(true); }, []);
  useEffect(() => {
    const scheduleSync = () => {
      if (syncScheduled.current) return;
      syncScheduled.current = true;
      queueMicrotask(() => { syncScheduled.current = false; void sync(); });
    };
    void sync();
    const unsubscribers = [favoritesService, likesService, preferencesService, historyService].map((service) => service.subscribe(scheduleSync));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [sync]);
  const toggleFavorite = useCallback((seriesId: string) => { void favoritesService.toggle(seriesId); }, []);
  const toggleLike = useCallback((episodeId: string) => { void likesService.toggle(episodeId); }, []);
  const setAutoplay = useCallback((enabled: boolean) => { void preferencesService.setAutoplay(enabled); }, []);
  return <AppStateContext.Provider value={{ ...state, hydrated, toggleFavorite, toggleLike, setAutoplay }}>{children}</AppStateContext.Provider>;
}

export const useAppState = () => useContext(AppStateContext);
