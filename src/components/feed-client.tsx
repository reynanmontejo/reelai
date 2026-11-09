'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStreamSource } from '@/hooks/use-stream-source';
import { useWatchHistory } from '@/hooks/use-watch-history';
import { episodeService, recommendationService, seriesService } from '@/lib/application';
import type { Episode } from '@/types/episode';
import type { Series } from '@/types/series';
import { LikeButton, SaveButton } from './library-actions';
import { ShareButton } from './share-button';
import { VideoPlayer } from './video-player';

export type FeedItem = { series: Series; episode: Episode };

function ReelMedia({ item, active, onProgress }: { item: FeedItem; active: boolean; onProgress: (position: number, duration: number) => void }) {
  const { source, loading, error, reportPlaybackFailure, retry } = useStreamSource(item.episode.id, 'feed');
  if (loading) return <div className="universal-player player-status"><span className="spinner"/>Loading reel…</div>;
  if (error || !source) return <div className="universal-player player-error"><b>Unable to load this reel</b><span>{error || 'No active source is available.'}</span><button className="secondary" onClick={retry}>Try again</button></div>;
  return <VideoPlayer compact source={source} poster={item.episode.thumbnailUrl || item.series.posterUrl} title={`${item.series.title} episode ${item.episode.episodeNumber}`} active={active} autoPlay muted onProgress={onProgress} onPause={onProgress} onPlaybackError={(_error, position, duration) => { if (position > 0) onProgress(position, duration); reportPlaybackFailure(); }}/>;
}

export function FeedClient({ initialItems }: { initialItems: FeedItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef(0);
  const progressRef = useRef<Record<string, { position: number; duration: number }>>({});
  const { saveProgress } = useWatchHistory();

  const applyContinuationRule = useCallback(async (leavingIndex: number) => {
    const leaving = items[leavingIndex];
    const progress = progressRef.current[leaving.episode.id];
    if (!progress?.duration || leavingIndex + 1 >= items.length) return;
    const nextEpisodeInSeries = await episodeService.getNextEpisode(leaving.episode.id);
    const otherSeries = (await seriesService.getAll()).filter((series) => series.id !== leaving.series.id);
    const firstEpisodes = await episodeService.getBySeriesIds(otherSeries.map((series) => series.id), 1);
    const differentSeriesCandidates = otherSeries.map((series) => ({ series, episode: firstEpisodes.find((episode) => episode.seriesId === series.id) })).filter((candidate): candidate is FeedItem => Boolean(candidate.episode));
    const recommendation = recommendationService.recommendNext({ currentEpisode: leaving.episode, currentSeries: leaving.series, completionPercentage: progress.position / progress.duration, watchedSeconds: progress.position, nextEpisodeInSeries, differentSeriesCandidates });
    if (!recommendation) return;
    setItems((current) => { const next = [...current]; next[leavingIndex + 1] = recommendation; return next; });
  }, [items]);

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-reel-index]');
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible || visible.intersectionRatio < 0.7) return;
      const nextIndex = Number((visible.target as HTMLElement).dataset.reelIndex);
      if (nextIndex === activeRef.current) return;
      const previous = activeRef.current;
      const leavingVideo = nodes[previous]?.querySelector<HTMLVideoElement>('video');
      if (leavingVideo && Number.isFinite(leavingVideo.duration) && leavingVideo.duration > 0) {
        progressRef.current[items[previous].episode.id] = { position: leavingVideo.currentTime, duration: leavingVideo.duration };
      }
      activeRef.current = nextIndex;
      void applyContinuationRule(previous);
      setActiveIndex(nextIndex);
    }, { threshold: [0.7, 0.85] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [applyContinuationRule, items.length]);

  return <main className="feed" aria-label="Vertical reel feed">{items.map((item, index) => {
    const near = Math.abs(index - activeIndex) <= 1;
    const recordProgress = (position: number, duration: number) => {
      progressRef.current[item.episode.id] = { position, duration };
      if (position > 0) saveProgress({ episodeId: item.episode.id, seriesId: item.series.id, positionSeconds: position, durationSeconds: duration });
    };
    return <section className="reel" data-reel-index={index} key={`${item.episode.id}:${index}`}><div className="feed-video">
      <>{near
        ? <ReelMedia item={item} active={index === activeIndex} onProgress={recordProgress}/>
        : <div className="reel-placeholder" style={{ backgroundImage: `url(${item.series.posterUrl})` }}/>}</>
      <div className="player-caption"><div className="eyebrow">EPISODE {item.episode.episodeNumber}</div><h3>{item.series.title}</h3><small>{item.episode.title} · {item.series.genres[0]}</small></div>
      <div className="rail">
        <div><LikeButton compact className="rail-button" episodeId={item.episode.id}/><span>Like</span></div>
        <div><button className="rail-button" aria-label="Comments coming soon" disabled>◌</button><span>Soon</span></div>
        <div><SaveButton compact className="rail-button" seriesId={item.series.id}/><span>Save</span></div>
        <div><ShareButton compact className="rail-button" title={`${item.series.title} episode ${item.episode.episodeNumber}`} urlPath={`/watch/${item.series.slug}/${item.episode.episodeNumber}`}/><span>Share</span></div>
      </div>
      {index === 0 && <div className="swipe-hint">Swipe or scroll for the next reel ↓</div>}
    </div></section>;
  })}</main>;
}
