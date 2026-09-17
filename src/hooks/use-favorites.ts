'use client';
import { useAppState } from '@/components/app-state';
export function useFavorites() { const { favoriteIds, toggleFavorite, hydrated } = useAppState(); return { favoriteIds, toggleFavorite, loading: !hydrated }; }
