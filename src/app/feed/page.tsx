import { FeedClient, type FeedItem } from '@/components/feed-client';
import { episodeService, seriesService } from '@/lib/application';

export const dynamic = 'force-dynamic';

export default async function Feed() {
  const series = await seriesService.getAll();
  const episodes = await episodeService.getBySeriesIds(series.map((show) => show.id));
  const items = series.map((show, index) => ({
    series: show,
    episode: episodes.find((episode) => episode.seriesId === show.id && episode.episodeNumber === index % 3 + 1),
  })).filter((item): item is FeedItem => Boolean(item.episode));
  return items.length
    ? <FeedClient initialItems={items}/>
    : <main className="page"><div className="state-card"><b>No reels are available</b><p className="muted">Please check back soon.</p></div></main>;
}
