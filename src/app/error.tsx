'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page"><div className="state-card"><b>Something interrupted this story</b><p className="muted">The page could not be loaded. Your saved progress is still safe on this device.</p><button className="primary" onClick={reset}>Try again</button></div></main>;
}
