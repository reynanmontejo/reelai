'use client';

import { useCallback, useEffect, useState } from 'react';
import { streamService } from '@/lib/application';
import type { ResolvedPlaybackCandidate } from '@/types/external-provider';
import type { StreamPurpose, StreamSource } from '@/types/stream';

type Purpose = Exclude<StreamPurpose, 'both'>;

function candidateToSource(candidate: ResolvedPlaybackCandidate): StreamSource {
  return {
    id: candidate.sourceDefinitionId,
    episodeId: candidate.episodeId,
    provider: candidate.providerId,
    type: candidate.type,
    url: candidate.url,
    priority: candidate.priority,
    isActive: true,
    capabilities: candidate.capabilities,
    expiresAt: candidate.expiresAt,
  };
}

export function useStreamSource(episodeId: string, purpose: Purpose = 'watch') {
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey(current => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');
    setSources([]);
    setSourceIndex(0);

    const load = async () => {
      if (process.env.NEXT_PUBLIC_REELAI_CONTENT_BACKEND !== 'supabase') {
        return streamService.getSources(episodeId, purpose);
      }
      const response = await fetch(`/api/stream/${encodeURIComponent(episodeId)}?purpose=${purpose}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as {
        candidates?: ResolvedPlaybackCandidate[];
        error?: { message?: string };
      };
      if (!response.ok || !payload.candidates?.length) throw new Error(payload.error?.message || 'No active source is available.');
      return payload.candidates.map(candidateToSource);
    };

    void load()
      .then((resolved) => { if (active) setSources(resolved); })
      .catch((reason: unknown) => {
        if (active && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to resolve stream.');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; controller.abort(); };
  }, [episodeId, purpose, reloadKey]);

  const reportPlaybackFailure = useCallback(() => {
    setSourceIndex((current) => {
      if (current + 1 < sources.length) return current + 1;
      setError('All available playback sources failed.');
      return current;
    });
  }, [sources.length]);

  return {
    source: sources[sourceIndex] || null,
    candidates: sources,
    sourceIndex,
    reportPlaybackFailure,
    error,
    loading,
    retry,
  };
}
