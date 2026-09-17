'use client';

import { useAutoplay } from '@/hooks/use-autoplay';
import { useFavorites } from '@/hooks/use-favorites';
import { useLikes } from '@/hooks/use-likes';

export function SaveButton({ seriesId, className = 'secondary', compact = false }: { seriesId: string; className?: string; compact?: boolean }) {
  const { favoriteIds, toggleFavorite, loading } = useFavorites();
  const saved = favoriteIds.includes(seriesId);
  return <button aria-label={saved ? 'Remove from my list' : 'Add to my list'} className={`${className} ${saved ? 'is-active' : ''}`} onClick={() => toggleFavorite(seriesId)} disabled={loading}>{compact ? (saved ? '✓' : '♧') : saved ? '✓ In my list' : '＋ My list'}</button>;
}

export function LikeButton({ episodeId, className = 'secondary', compact = false }: { episodeId: string; className?: string; compact?: boolean }) {
  const { likedEpisodeIds, toggleLike, loading } = useLikes();
  const liked = likedEpisodeIds.includes(episodeId);
  return <button aria-label={liked ? 'Unlike episode' : 'Like episode'} className={`${className} ${liked ? 'is-active' : ''}`} onClick={() => toggleLike(episodeId)} disabled={loading}>{liked ? '♥' : '♡'}{compact ? '' : liked ? ' Liked' : ' Like'}</button>;
}

export function AutoplayToggle() {
  const { autoplay, setAutoplay, loading } = useAutoplay();
  return <button className={`pill ${autoplay ? 'toggle-on' : ''}`} disabled={loading} onClick={() => setAutoplay(!autoplay)} aria-pressed={autoplay}>{autoplay ? 'On' : 'Off'}</button>;
}
