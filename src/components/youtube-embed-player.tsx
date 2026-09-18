'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoPlayerProps } from './video-player';

type YouTubeEvent = { target: YouTubePlayer; data?: number };
type YouTubePlayer = {
  destroy(): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
};
type YouTubeApi = {
  Player: new (element: HTMLIFrameElement, options: { events: {
    onReady(event: YouTubeEvent): void;
    onStateChange(event: YouTubeEvent): void;
    onError(event: YouTubeEvent): void;
    onAutoplayBlocked?(): void;
  } }) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | undefined;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => reject(new Error('YouTube player API timed out.')), 12_000);
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube player API did not initialize.'));
    };
    if (!document.querySelector('script[data-reelai-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.reelaiYoutubeApi = 'true';
      script.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('YouTube player API could not be loaded.'));
      };
      document.head.appendChild(script);
    }
  }).catch((error) => {
    youtubeApiPromise = undefined;
    throw error;
  });
  return youtubeApiPromise;
}

export function youtubeVideoIdFromEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube-nocookie.com' || !match) return null;
    return match[1];
  } catch {
    return null;
  }
}

function iframeUrl(sourceUrl: string, origin: string) {
  const url = new URL(sourceUrl);
  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('rel', '0');
  url.searchParams.set('origin', origin);
  return url.toString();
}

export function YouTubeEmbedPlayer({ source, title, active = true, autoPlay = false, muted = false, compact = false, resumePosition = 0, autoplayNext = false, nextEpisodeLabel = 'Next episode', onProgress, onPause, onEnded, onNextEpisode, onPlaybackError }: VideoPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YouTubePlayer | undefined>(undefined);
  const apiRef = useRef<YouTubeApi | undefined>(undefined);
  const lastSavedRef = useRef(resumePosition);
  const callbacksRef = useRef({ onProgress, onPause, onEnded, onNextEpisode, onPlaybackError });
  const settingsRef = useRef({ active, autoPlay, muted, resumePosition, autoplayNext });
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [origin, setOrigin] = useState('');
  const videoId = youtubeVideoIdFromEmbedUrl(source.url);
  const src = origin && videoId ? iframeUrl(source.url, origin) : '';

  useEffect(() => { callbacksRef.current = { onProgress, onPause, onEnded, onNextEpisode, onPlaybackError }; }, [onEnded, onNextEpisode, onPause, onPlaybackError, onProgress]);
  useEffect(() => { settingsRef.current = { active, autoPlay, muted, resumePosition, autoplayNext }; }, [active, autoPlay, autoplayNext, muted, resumePosition]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const snapshot = useCallback((force = false) => {
    const player = playerRef.current;
    if (!player) return { position: 0, duration: 0 };
    const position = Number(player.getCurrentTime()) || 0;
    const duration = Number(player.getDuration()) || 0;
    if (duration > 0 && (force || Math.abs(position - lastSavedRef.current) >= 10)) {
      lastSavedRef.current = position;
      callbacksRef.current.onProgress?.(position, duration);
    }
    return { position, duration };
  }, []);

  const reportError = useCallback((message: string) => {
    const state = snapshot(true);
    setError(message);
    setLoading(false);
    callbacksRef.current.onPlaybackError?.(new Error(message), state.position, state.duration);
  }, [snapshot]);

  useEffect(() => {
    if (!videoId) {
      setError('This YouTube embed URL is invalid.');
      setLoading(false);
      return;
    }
    if (!src || !iframeRef.current) return;
    let cancelled = false;
    let player: YouTubePlayer | undefined;
    setError('');
    setLoading(true);
    setReady(false);
    lastSavedRef.current = resumePosition;
    void loadYouTubeApi().then((api) => {
      if (cancelled || !iframeRef.current) return;
      apiRef.current = api;
      player = new api.Player(iframeRef.current, {
        events: {
          onReady(event) {
            if (cancelled) return;
            playerRef.current = event.target;
            setReady(true);
            setLoading(false);
            const duration = Number(event.target.getDuration()) || 0;
            const settings = settingsRef.current;
            if (settings.resumePosition > 2 && settings.resumePosition < duration - 2) event.target.seekTo(settings.resumePosition, true);
            if (settings.muted) event.target.mute(); else event.target.unMute();
            if (settings.active && settings.autoPlay) event.target.playVideo();
          },
          onStateChange(event) {
            if (cancelled) return;
            const state = event.data;
            setPlaying(state === api.PlayerState.PLAYING);
            if (state === api.PlayerState.PLAYING) setLoading(false);
            if (state === api.PlayerState.BUFFERING) setLoading(true);
            if (state === api.PlayerState.PAUSED) {
              const current = snapshot(true);
              callbacksRef.current.onPause?.(current.position, current.duration);
            }
            if (state === api.PlayerState.ENDED) {
              const current = snapshot(true);
              const completedAt = current.duration || current.position;
              callbacksRef.current.onProgress?.(completedAt, completedAt);
              callbacksRef.current.onEnded?.(completedAt, completedAt);
              if (settingsRef.current.autoplayNext && callbacksRef.current.onNextEpisode) setCountdown(3);
            }
          },
          onError() { if (!cancelled) reportError('This YouTube video is unavailable or cannot be embedded.'); },
          onAutoplayBlocked() { if (!cancelled) setPlaying(false); },
        },
      });
      playerRef.current = player;
    }).catch((reason: unknown) => {
      if (!cancelled) reportError(reason instanceof Error ? reason.message : 'The YouTube player could not be loaded.');
    });
    return () => {
      cancelled = true;
      snapshot(true);
      playerRef.current = undefined;
      player?.destroy();
    };
  }, [reportError, retryKey, snapshot, source.id, source.url, src, videoId]);

  useEffect(() => {
    if (!ready) return;
    const player = playerRef.current;
    if (!player) return;
    if (!active) {
      snapshot(true);
      player.pauseVideo();
    } else if (autoPlay) {
      if (muted) player.mute();
      player.playVideo();
    }
  }, [active, autoPlay, muted, ready, snapshot]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => snapshot(), 1_000);
    return () => window.clearInterval(timer);
  }, [ready, snapshot]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      callbacksRef.current.onNextEpisode?.();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value === null ? null : value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    const flush = () => snapshot(true);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [snapshot]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player || !apiRef.current) return;
    if (player.getPlayerState() === apiRef.current.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  };

  const openUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : 'https://www.youtube.com/';
  return <div className={`universal-player youtube-embed-player ${compact ? 'compact-player' : ''}`} ref={hostRef}>
    {src && <iframe key={`${source.id}:${retryKey}`} ref={iframeRef} src={src} title={title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen/>}
    {loading && !error && <div className="player-status"><span className="spinner"/>Loading YouTube…</div>}
    {error && <div className="player-error"><b>Unable to play this YouTube video</b><span>{error}</span><div className="actions"><button className="secondary" onClick={() => { setError(''); setRetryKey((value) => value + 1); }}>Try again</button><a className="secondary" href={openUrl} target="_blank" rel="noreferrer">Open YouTube</a></div></div>}
    {!compact && ready && !error && <button className="center-play" aria-label={playing ? 'Pause video' : 'Play video'} onClick={togglePlay}>{playing ? 'Ⅱ' : '▶'}</button>}
    {!compact && !error && <div className="embed-note">Playback controls by YouTube. <a href={openUrl} target="_blank" rel="noreferrer">Open on YouTube</a></div>}
    {countdown !== null && <div className="autoplay-countdown"><div className="eyebrow">UP NEXT</div><b>{nextEpisodeLabel}</b><strong>{countdown}</strong><button onClick={() => setCountdown(null)}>Cancel</button></div>}
  </div>;
}
