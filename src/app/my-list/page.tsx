'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SeriesCard } from '@/components/cards';
import { useFavorites } from '@/hooks/use-favorites';
import { seriesService } from '@/lib/application';
import type { Series } from '@/types/series';

export default function MyList() {
  const { favoriteIds, loading: preferencesLoading } = useFavorites();
  const [shows, setShows] = useState<Series[]>([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState(false);

  useEffect(() => {
    let active = true;
    void seriesService.getAll()
      .then((items) => { if (active) setShows(items); })
      .catch(() => { if (active) setContentError(true); })
      .finally(() => { if (active) setContentLoading(false); });
    return () => { active = false; };
  }, []);

  const savedShows = shows.filter((show) => favoriteIds.includes(show.id));
  const loading = preferencesLoading || contentLoading;
  return <main className="page"><div className="eyebrow">YOUR SPACE</div><h1 className="title-xl">My list</h1><p className="muted">Stories you saved for later.</p>{loading ? <div className="state-card"><span className="spinner"/>Loading your list…</div> : contentError ? <div className="state-card"><b>Unable to load your saved stories</b><p className="muted">Your list remains safe on this device.</p></div> : savedShows.length ? <div className="grid content-top">{savedShows.map((show) => <SeriesCard key={show.id} show={show}/>)}</div> : <div className="state-card"><b>Your list is ready for a story</b><p className="muted">Save a series and it will appear here on this device.</p><Link className="primary" href="/explore">Explore stories</Link></div>}</main>;
}
