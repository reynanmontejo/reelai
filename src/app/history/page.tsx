'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWatchHistory } from '@/hooks/use-watch-history';
import { episodeService, seriesService } from '@/lib/application';
import type { Episode } from '@/types/episode';
import type { Series } from '@/types/series';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function History() {
  const { history, loading: historyLoading } = useWatchHistory();
  const [catalog, setCatalog] = useState<{ series: Series[]; episodes: Episode[] }>({ series: [], episodes: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);

  useEffect(() => {
    let active = true;
    void seriesService.getAll()
      .then(async (series) => ({ series, episodes: await episodeService.getBySeriesIds(series.map((item) => item.id)) }))
      .then((result) => { if (active) setCatalog(result); })
      .catch(() => { if (active) setCatalogError(true); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  const items = Object.values(history).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const loading = historyLoading || catalogLoading;
  return <main className="page"><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h1 className="title-xl">Watch history</h1>{loading ? <div className="state-card"><span className="spinner"/>Loading watch history…</div> : catalogError ? <div className="state-card"><b>Unable to load watch history</b><p className="muted">Your saved progress remains safe on this device.</p></div> : items.length ? items.map((item) => { const show = catalog.series.find((series) => series.id === item.seriesId); const episode = catalog.episodes.find((candidate) => candidate.id === item.episodeId); if (!show || !episode) return null; const percent = item.durationSeconds ? Math.min(100, item.positionSeconds / item.durationSeconds * 100) : 0; return <Link href={`/watch/${show.slug}/${episode.episodeNumber}`} className="episode" key={item.episodeId}><span className="epnum">{String(episode.episodeNumber).padStart(2, '0')}</span><div className="thumb"><img src={show.posterUrl} alt=""/></div><div><b>{show.title}</b><p className="muted history-meta">Episode {episode.episodeNumber}: {episode.title} · {time(item.positionSeconds)} / {time(item.durationSeconds)}</p><div className="progress"><i style={{ width: `${percent}%` }}/></div></div><span>{item.completed ? 'Replay' : 'Continue'} →</span></Link>; }) : <div className="state-card"><b>No watch history yet</b><p className="muted">Start an episode and your progress will be saved automatically.</p><Link className="primary" href="/explore">Find a series</Link></div>}</main>;
}
