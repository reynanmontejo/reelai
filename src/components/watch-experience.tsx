'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAutoplay } from '@/hooks/use-autoplay';
import { useStreamSource } from '@/hooks/use-stream-source';
import { useWatchHistory } from '@/hooks/use-watch-history';
import { AutoplayToggle, LikeButton, SaveButton } from './library-actions';
import { ShareButton } from './share-button';
import { VideoPlayer } from './video-player';
import type { Episode } from '@/types/episode';
import type { Series } from '@/types/series';

const duration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function WatchExperience({ show, episode, upcoming }: { show: Series; episode: Episode; upcoming: Episode[] }) {
  const router = useRouter();
  const { autoplay } = useAutoplay();
  const { history, saveProgress, loading: historyLoading } = useWatchHistory();
  const { source, loading: sourceLoading, error: sourceError, reportPlaybackFailure } = useStreamSource(episode.id);
  const savedProgress = history[episode.id];
  const resume = historyLoading || savedProgress?.completed ? 0 : savedProgress?.positionSeconds || 0;
  const save = useCallback((positionSeconds: number, durationSeconds: number) => saveProgress({ episodeId: episode.id, seriesId: show.id, positionSeconds, durationSeconds }), [episode.id, saveProgress, show.id]);
  const next = upcoming[0];
  const goNext = useCallback(() => { if (next) router.push(`/watch/${show.slug}/${next.episodeNumber}`); }, [next, router, show.slug]);

  return <main className="page"><div className="watch-layout">
    <div className="watch-player-shell">{sourceLoading
      ? <div className="universal-player player-status"><span className="spinner"/>Resolving stream…</div>
      : sourceError || !source
        ? <div className="universal-player player-error"><b>Unable to resolve this episode</b><span>{sourceError || 'No active source is available.'}</span></div>
        : <><VideoPlayer source={source} poster={episode.thumbnailUrl || show.posterUrl} title={`${show.title} — Episode ${episode.episodeNumber}`} resumePosition={resume} autoplayNext={autoplay} nextEpisodeLabel={next ? `Episode ${next.episodeNumber}: ${next.title}` : undefined} onProgress={save} onPause={save} onEnded={save} onNextEpisode={goNext} onPlaybackError={(_error, position, mediaDuration) => { if (position > 0) save(position, mediaDuration); reportPlaybackFailure(); }}/><div className="source-label">{source.type.toUpperCase()} · {source.provider}</div></>}
    </div>
    <section className="queue">
      <div className="eyebrow">NOW WATCHING</div><h1>{show.title}</h1>
      <p className="muted">Episode {episode.episodeNumber} · {episode.title}</p>
      {resume > 2 && <p className="resume-note">Resuming from {duration(Math.floor(resume))}</p>}
      {savedProgress?.completed && <p className="resume-note">Previously completed · Replay from the beginning</p>}
      <div className="actions"><LikeButton episodeId={episode.id}/><SaveButton seriesId={show.id}/><ShareButton title={`${show.title} episode ${episode.episodeNumber}`}/></div>
      <div className="autoplay-setting"><span><b>Autoplay next episode</b><small>Starts after a three-second countdown</small></span><AutoplayToggle/></div>
      <div className="tabs"><b>Up next</b><span className="muted">Episodes</span></div>
      {upcoming.slice(0, 5).map((item) => <Link href={`/watch/${show.slug}/${item.episodeNumber}`} className="episode" key={item.id}><span className="epnum">{item.episodeNumber}</span><div className="thumb"><img src={item.thumbnailUrl || show.posterUrl} alt=""/></div><div><b>{item.title}</b><small className="muted"> {duration(item.durationSeconds)}</small></div></Link>)}
      {next && <button className="primary next-button" onClick={goNext}>Next episode →</button>}
    </section>
  </div></main>;
}
