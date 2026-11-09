import Link from 'next/link';
import type { Series } from '@/types/series';

export function SeriesCard({ show, rank }: { show: Series; rank?: number }) {
  return <Link href={`/series/${show.slug}`} className="card"><div className="poster">{show.badge && <span className="badge">{show.badge}</span>}<img src={show.posterUrl} alt={show.title} loading="lazy"/>{rank && <span className="rank">{rank}</span>}</div><h3>{show.title}</h3><small>{[show.genres[0], `${show.episodeCount} EP`].filter(Boolean).join(' · ')}</small></Link>;
}

export function SeriesRow({ title, items, ranked = false }: { title: string; items: Series[]; ranked?: boolean }) {
  if (!items.length) return null;
  return <section className="section"><div className="section-head"><h2>{title}</h2><Link href="/explore">View all →</Link></div><div className="row">{items.map((show, index) => <SeriesCard key={show.id} show={show} rank={ranked ? index + 1 : undefined}/>)}</div></section>;
}
