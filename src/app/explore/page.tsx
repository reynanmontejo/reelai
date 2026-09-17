'use client';

import { useEffect, useState } from 'react';
import { SeriesCard } from '@/components/cards';
import { seriesService } from '@/lib/application';
import type { Series } from '@/types/series';

export default function Explore() {
  const [genre, setGenre] = useState('All');
  const [genres, setGenres] = useState<string[]>(['All']);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { setQuery(new URLSearchParams(window.location.search).get('q') || ''); }, []);
  useEffect(() => {
    let active = true;
    void seriesService.getGenres().then((availableGenres) => {
      if (active) setGenres(['All', ...availableGenres]);
    }).catch(() => {
      if (active) setError('Genres could not be loaded.');
    });
    return () => { active = false; };
  }, [reloadKey]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      void seriesService.search(query, genre === 'All' ? undefined : genre)
        .then((results) => { if (active) setItems(results); })
        .catch(() => { if (active) setError('Stories could not be loaded.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [genre, query, reloadKey]);

  return <main className="page"><div className="eyebrow">FIND YOUR NEXT OBSESSION</div><h1 className="title-xl">Explore stories</h1><input aria-label="Explore search" className="explore-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, genre or mood…"/><div className="chips">{genres.map((item) => <button key={item} onClick={() => setGenre(item)} className={`pill ${item === genre ? 'active' : ''}`}>{item}</button>)}</div>{loading ? <div className="state-card"><span className="spinner"/>Loading stories…</div> : error ? <div className="state-card"><b>Unable to load stories</b><p className="muted">{error}</p><button className="secondary" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div> : items.length ? <div className="grid">{items.map((show) => <SeriesCard key={show.id} show={show}/>)}</div> : <div className="state-card"><b>No stories found</b><p className="muted">Try a different title, genre, or mood.</p><button className="secondary" onClick={() => { setQuery(''); setGenre('All'); }}>Clear filters</button></div>}</main>;
}
