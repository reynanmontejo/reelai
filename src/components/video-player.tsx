'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamSource } from '@/types/stream';

type VideoPlayerProps = {
  source: StreamSource;
  poster?: string;
  title: string;
  active?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  compact?: boolean;
  resumePosition?: number;
  autoplayNext?: boolean;
  nextEpisodeLabel?: string;
  onProgress?: (position: number, duration: number) => void;
  onPause?: (position: number, duration: number) => void;
  onEnded?: (position: number, duration: number) => void;
  onNextEpisode?: () => void;
  onPlaybackError?: (error: Error, position: number, duration: number) => void;
};

const formatTime = (value: number) => {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
};

export function VideoPlayer({ source, poster, title, active = true, autoPlay = false, muted = false, compact = false, resumePosition = 0, autoplayNext = false, nextEpisodeLabel = 'Next episode', onProgress, onPause, onEnded, onNextEpisode, onPlaybackError }: VideoPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const failureReportedRef = useRef(false);
  const resumePositionRef = useRef(resumePosition);
  const embedTimeoutRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(muted ? 0 : 1);
  const [speed, setSpeed] = useState(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onPlaybackErrorRef.current = onPlaybackError; }, [onPlaybackError]);
  useEffect(() => { failureReportedRef.current = false; }, [source.id, source.url]);

  useEffect(() => {
    resumePositionRef.current = resumePosition;
    const video = videoRef.current;
    if (video && video.readyState >= 1 && video.currentTime < 2 && resumePosition > 2 && resumePosition < video.duration - 2) {
      video.currentTime = resumePosition;
    }
  }, [resumePosition, source.id]);

  const emitProgress = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    if (force || Math.abs(video.currentTime - lastSavedRef.current) >= 10) {
      lastSavedRef.current = video.currentTime;
      onProgressRef.current?.(video.currentTime, video.duration);
    }
  }, []);

  const reportTerminalError = useCallback((message: string) => {
    if (failureReportedRef.current) return;
    failureReportedRef.current = true;
    const video = videoRef.current;
    const currentPosition = video?.currentTime || 0;
    const mediaDuration = video?.duration && Number.isFinite(video.duration) ? video.duration : 0;
    emitProgress(true);
    setLoading(false);
    setError(message);
    onPlaybackErrorRef.current?.(new Error(message), currentPosition, mediaDuration);
  }, [emitProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || source.type === 'embed') return;
    let hls: { destroy: () => void } | undefined;
    let cancelled = false;
    setError(''); setLoading(true); setPosition(0); setDuration(0); lastSavedRef.current = resumePositionRef.current;

    async function attach() {
      if (!video || cancelled) return;
      if (source.type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const Hls = (await import('hls.js')).default;
        if (!Hls.isSupported()) { reportTerminalError('HLS playback is not supported in this browser.'); return; }
        const instance = new Hls();
        hls = instance;
        instance.loadSource(source.url);
        instance.attachMedia(video);
        instance.on(Hls.Events.MANIFEST_PARSED, () => { if (autoPlay && active) void video.play().catch(() => undefined); });
        instance.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) reportTerminalError('This HLS stream could not be loaded.'); });
      } else {
        video.src = source.url;
        video.load();
      }
    }
    void attach();
    return () => { cancelled = true; hls?.destroy(); video.removeAttribute('src'); video.load(); };
  }, [reportTerminalError, retryKey, source.id, source.type, source.url]);

  useEffect(() => { setPipSupported(Boolean(document.pictureInPictureEnabled)); }, []);

  useEffect(() => {
    if (source.type !== 'embed') return;
    setError('');
    setLoading(true);
    failureReportedRef.current = false;
    const sourceHost = new URL(source.url).hostname;
    embedTimeoutRef.current = window.setTimeout(() => reportTerminalError('The embedded player did not become available.'), 12_000);
    const onPolicyViolation = (event: SecurityPolicyViolationEvent) => {
      if (!['frame-src', 'child-src'].includes(event.effectiveDirective)) return;
      try {
        if (new URL(event.blockedURI).hostname === sourceHost) reportTerminalError('This embedded player is blocked by the application security policy.');
      } catch {
        // Ignore unrelated or non-URL policy violations.
      }
    };
    window.addEventListener('securitypolicyviolation', onPolicyViolation);
    return () => {
      if (embedTimeoutRef.current !== null) window.clearTimeout(embedTimeoutRef.current);
      embedTimeoutRef.current = null;
      window.removeEventListener('securitypolicyviolation', onPolicyViolation);
    };
  }, [reportTerminalError, retryKey, source.type, source.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || source.type === 'embed') return;
    if (active && autoPlay) void video.play().catch(() => undefined);
    if (!active) { emitProgress(true); video.pause(); }
  }, [active, autoPlay, emitProgress, source.type]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); onNextEpisode?.(); return; }
    const timer = window.setTimeout(() => setCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, onNextEpisode]);

  useEffect(() => {
    const flush = () => emitProgress(true);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); };
  }, [emitProgress]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play(); else video.pause();
  };

  const handleLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    setLoading(false); setDuration(video.duration || 0);
    const startAt = resumePositionRef.current;
    if (startAt > 0 && startAt < video.duration - 2) video.currentTime = startAt;
    if (autoPlay && active) void video.play().catch(() => undefined);
  };

  const handleEnded = () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaying(false); onProgress?.(video.duration, video.duration); onEnded?.(video.duration, video.duration);
    if (autoplayNext && onNextEpisode) setCountdown(3);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) void hostRef.current?.requestFullscreen(); else void document.exitFullscreen();
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || !source.capabilities.pictureInPicture) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture();
  };

  if (source.type === 'embed') {
    return <div className={`universal-player ${compact ? 'compact-player' : ''}`} ref={hostRef}><iframe key={retryKey} src={source.url} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={() => { if (embedTimeoutRef.current !== null) window.clearTimeout(embedTimeoutRef.current); embedTimeoutRef.current = null; setLoading(false); }} onError={() => reportTerminalError('This authorized embed could not be loaded.')}/>{loading && !error && <div className="player-status"><span className="spinner"/>Loading embed…</div>}{error && <div className="player-error"><b>Unable to load this embed</b><span>{error}</span><div className="actions"><button className="secondary" onClick={() => { failureReportedRef.current = false; setError(''); setLoading(true); setRetryKey((value) => value + 1); }}>Try again</button><a className="secondary" href={source.url} target="_blank" rel="noreferrer">Open provider</a></div></div>}<div className="embed-note">Playback controls by {source.provider}. <a href={source.url} target="_blank" rel="noreferrer">Open provider</a></div></div>;
  }

  return <div className={`universal-player ${compact ? 'compact-player' : ''}`} ref={hostRef}>
    <video ref={videoRef} poster={poster} playsInline muted={muted} preload={active ? 'metadata' : 'none'} onClick={togglePlay}
      onLoadStart={() => setLoading(true)} onLoadedMetadata={handleLoaded} onCanPlay={() => setLoading(false)} onPlaying={() => setPlaying(true)}
      onPause={() => { const video = videoRef.current; setPlaying(false); if (video && !video.ended) onPause?.(video.currentTime, video.duration || 0); }}
      onTimeUpdate={() => { const video = videoRef.current; if (!video) return; setPosition(video.currentTime); setDuration(video.duration || 0); emitProgress(); }}
      onEnded={handleEnded} onError={() => reportTerminalError('Video playback failed. Check your connection and try again.')}/>
    <div className="video-shade"/>
    {loading && !error && <div className="player-status"><span className="spinner"/>Loading video…</div>}
    {error && <div className="player-error"><b>Unable to play this episode</b><span>{error}</span><button className="secondary" onClick={() => { failureReportedRef.current = false; setError(''); setRetryKey((value) => value + 1); }}>Try again</button></div>}
    {!compact && !error && <button className="center-play" aria-label={playing ? 'Pause video' : 'Play video'} onClick={togglePlay}>{playing ? 'Ⅱ' : '▶'}</button>}
    {!compact && <div className="video-controls">
      <input aria-label="Seek video" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(position, duration || 0)} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }}/>
      <div className="control-row"><button onClick={togglePlay}>{playing ? 'Ⅱ' : '▶'}</button><span>{formatTime(position)} / {formatTime(duration)}</span><label>Vol <input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (videoRef.current) { videoRef.current.volume = value; videoRef.current.muted = value === 0; } }}/></label><select aria-label="Playback speed" disabled={!source.capabilities.playbackRate} value={speed} onChange={(event) => { const value = Number(event.target.value); setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><span className="control-spacer"/><button onClick={togglePiP} disabled={!pipSupported || !source.capabilities.pictureInPicture}>PiP</button><button onClick={toggleFullscreen}>⛶</button></div>
    </div>}
    {countdown !== null && <div className="autoplay-countdown"><div className="eyebrow">UP NEXT</div><b>{nextEpisodeLabel}</b><strong>{countdown}</strong><button onClick={() => setCountdown(null)}>Cancel</button></div>}
  </div>;
}
