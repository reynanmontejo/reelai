export type StreamType = 'mp4' | 'webm' | 'hls' | 'embed';
export type StreamPurpose = 'watch' | 'feed' | 'both';

export interface StreamCapabilities {
  progressTracking: boolean;
  seek: boolean;
  pictureInPicture: boolean;
  playbackRate: boolean;
}

export interface StreamSource {
  id: string;
  episodeId: string;
  provider: string;
  type: StreamType;
  url: string;
  priority: number;
  isActive: boolean;
  capabilities: StreamCapabilities;
  expiresAt?: string;
}
