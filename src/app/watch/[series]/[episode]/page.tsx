import { notFound } from 'next/navigation';
import { WatchExperience } from '@/components/watch-experience';
import { episodeService, seriesService } from '@/lib/application';

export const dynamic = 'force-dynamic';

export default async function Watch({ params }: { params: Promise<{ series: string; episode: string }> }) {
  const route = await params;
  const show = await seriesService.getBySlug(route.series);
  if (!show) notFound();
  const episodeNumber = Number(route.episode);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) notFound();
  const episodes = await episodeService.getBySeries(show.id);
  const episode = episodes.find((item) => item.episodeNumber === episodeNumber);
  if (!episode) notFound();
  return <WatchExperience show={show} episode={episode} upcoming={episodes.filter((item) => item.episodeNumber > episodeNumber)}/>;
}
