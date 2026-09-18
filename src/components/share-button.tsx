'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

export function ShareButton({
  title,
  urlPath,
  className = 'secondary',
  compact = false,
}: {
  title: string;
  urlPath?: string;
  className?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2_000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const share = async () => {
    const url = urlPath ? new URL(urlPath, window.location.origin).toString() : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('failed');
    }
  };

  const label = status === 'copied' ? 'Copied!' : status === 'failed' ? 'Copy failed' : 'Share';
  return <button className={className} aria-label={`Share ${title}`} onClick={() => void share()}>{compact ? <Icon name="share"/> : `↗ ${label}`}</button>;
}
