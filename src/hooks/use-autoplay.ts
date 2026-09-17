'use client';
import { useAppState } from '@/components/app-state';
export function useAutoplay() { const { autoplay, setAutoplay, hydrated } = useAppState(); return { autoplay, setAutoplay, loading: !hydrated }; }
