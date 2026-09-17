import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SaveButton } from '@/components/library-actions';
import { episodeService, seriesService } from '@/lib/application';

export const dynamic = 'force-dynamic';

const duration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await seriesService.getBySlug(slug);
  if (!show) notFound();
  const episodes = await episodeService.getBySeries(show.id);
  return <main><section className="detail-hero"><div className="shell detail-wrap"><div className="detail-poster"><img src={show.posterUrl} alt={show.title}/></div><div className="detail-copy"><div className="eyebrow">{show.badge || 'REELAI PREMIERE'}</div><h1 className="title-xl">{show.title}</h1><div className="meta"><span>{show.genres[0]}</span><i className="dot"/><span>{show.episodeCount} Episodes</span>{show.releaseYear ? <><i className="dot"/><span>{show.releaseYear}</span></> : null}<span className="pill">HD</span></div><p className="muted">{show.description}</p><div className="actions"><Link href={`/watch/${show.slug}/1`} className="primary">▶ Play episode 1</Link><SaveButton seriesId={show.id}/><button className="secondary">↗ Share</button></div></div><aside className="side-info"><h4>Status</h4><p>{show.status || 'Available now'}</p><h4>Genres</h4><p>{show.genres.join(', ')}</p><h4>Tags</h4><p className="muted">{show.tags?.join(' · ')}</p></aside></div></section><div className="shell"><div className="tabs"><b>Episodes</b><span className="muted">About</span><span className="muted">Similar</span></div>{episodes.map((episode) => <Link href={`/watch/${show.slug}/${episode.episodeNumber}`} className="episode" key={episode.id}><span className="epnum">{String(episode.episodeNumber).padStart(2, '0')}</span><div className="thumb"><img src={episode.thumbnailUrl || show.posterUrl} alt=""/></div><div><b>{episode.title}</b><div className="progress"><i/></div></div><span className="muted">{duration(episode.durationSeconds)}　▶</span></Link>)}</div></main>;
}
