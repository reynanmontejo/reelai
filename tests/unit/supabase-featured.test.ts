import { describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '@/lib/supabase/client';
import { SupabaseContentProvider } from '@/providers/supabase.provider';

vi.mock('@/lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }));

function row(id: string, rank: number, published = true, createdAt = '2026-11-09') {
  return {
    id, trending_rank: rank, is_published: published, created_at: createdAt,
    slug: id, title: id, description: '', poster_url: '/posters/example.svg',
    episode_count: 47, genres: [], tags: [], is_ai_original: false,
  };
}

type Row = ReturnType<typeof row>;

// In-memory query fixture exercises published/ranking selection, not live Supabase.
function catalog(rows: Row[], fail = false) {
  const client = {
    from: () => {
      let matches = [...rows];
      const ordering: Array<{ field: keyof Row; ascending: boolean }> = [];
      const query = {
        select: () => query,
        eq: (field: keyof Row, value: unknown) => { matches = matches.filter(r => r[field] === value); return query; },
        gt: (field: keyof Row, value: number) => { matches = matches.filter(r => Number(r[field]) > value); return query; },
        order: (field: keyof Row, options?: { ascending?: boolean }) => { ordering.push({ field, ascending: options?.ascending !== false }); return query; },
        limit: () => query,
        maybeSingle: async () => {
          matches.sort((a, b) => {
            for (const order of ordering) {
              const left = a[order.field]; const right = b[order.field];
              if (left === right) continue;
              return (left < right ? -1 : 1) * (order.ascending ? 1 : -1);
            }
            return 0;
          });
          return { data: matches[0] || null, error: fail ? { code: 'TEST_UNAVAILABLE' } : null };
        },
      };
      return query;
    },
  };
  vi.mocked(getSupabaseClient).mockReturnValue(client as unknown as ReturnType<typeof getSupabaseClient>);
}

describe('Supabase featured title selection', () => {
  it('shows a newly imported published title without an editorial rank', async () => {
    catalog([row('imported-title', 0)]);
    await expect(new SupabaseContentProvider().getFeaturedSeries()).resolves.toMatchObject({ id: 'imported-title', episodeCount: 47 });
  });

  it('preserves ranked editorial selection ahead of newer unranked titles', async () => {
    catalog([row('new-import', 0), row('second-ranked', 2), row('featured', 1, true, '2026-10-01')]);
    await expect(new SupabaseContentProvider().getFeaturedSeries()).resolves.toMatchObject({ id: 'featured' });
  });

  it('chooses the newest published fallback deterministically and excludes drafts', async () => {
    catalog([row('draft', 1, false), row('older', 0, true, '2026-10-01'), row('b-title', 0), row('a-title', 0)]);
    await expect(new SupabaseContentProvider().getFeaturedSeries()).resolves.toMatchObject({ id: 'a-title' });
  });

  it('returns no feature only when no published title is available', async () => {
    catalog([row('draft', 0, false)]);
    await expect(new SupabaseContentProvider().getFeaturedSeries()).resolves.toBeNull();
  });

  it('preserves database failures as errors', async () => {
    catalog([], true);
    await expect(new SupabaseContentProvider().getFeaturedSeries()).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
  });
});
