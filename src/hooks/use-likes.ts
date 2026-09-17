'use client';
import { useAppState } from '@/components/app-state';
export function useLikes() { const { likedEpisodeIds, toggleLike, hydrated } = useAppState(); return { likedEpisodeIds, toggleLike, loading: !hydrated }; }
