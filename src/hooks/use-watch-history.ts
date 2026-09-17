'use client';
import { useCallback } from 'react';
import { useAppState } from '@/components/app-state';
import { historyService } from '@/lib/application';
import type { SaveProgressInput } from '@/types/history';
export function useWatchHistory() { const { history, hydrated } = useAppState(); const saveProgress = useCallback((input: SaveProgressInput) => { void historyService.saveProgress(input); }, []); return { history, saveProgress, loading: !hydrated }; }
