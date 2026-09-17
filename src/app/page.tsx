import Link from 'next/link';
import { SeriesRow } from '@/components/cards';
import { SaveButton } from '@/components/library-actions';
import { seriesService } from '@/lib/application';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [featured, trending, newReleases, romance] = await Promise.all([
    seriesService.getFeatured(),
    seriesService.getTrending(),
    seriesService.getNewReleases(),
    seriesService.getByGenre('Romance'),
  ]);

  if (!featured) {
    return <main className="page"><div className="state-card"><b>No stories are available</b><p className="muted">Please check back soon.</p></div></main>;
  }

  return <main><section className="hero"><div className="shell"><div className="hero-copy"><div className="eyebrow">{featured.badge || 'REELAI PREMIERE'}</div><h1>{featured.title}</h1><div className="meta"><b>{featured.releaseYear}</b><i className="dot"/><span>{featured.genres[0]}</span><i className="dot"/><span>{featured.episodeCount} Episodes</span><span className="pill">HD</span></div><p>{featured.description}</p><div className="actions"><Link className="primary" href={`/watch/${featured.slug}/1`}>▶ Watch now</Link><SaveButton seriesId={featured.id}/></div></div></div></section><div className="shell home-rows"><SeriesRow title="Trending now" items={trending} ranked/><SeriesRow title="New releases" items={newReleases}/><SeriesRow title="Because you watched romance" items={romance}/></div></main>;
}
