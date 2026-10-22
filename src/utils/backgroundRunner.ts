/**
 * Nexus Background Location Runner
 * 
 * Uses HTML5 Audio Loop + MediaSession API to keep GPS tracking alive
 * in the background when phone screen is locked or switching apps,
 * without forcing screen to stay awake (minimizing battery usage).
 */

// 1-second silent WAV audio
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABkYXRhEgAAAAEAAQCg/6D/oP+g/6D/';

export class BackgroundLocationRunner {
  private audio: HTMLAudioElement | null = null;
  private isRunning: boolean = false;
  private onStateChangeCallback: ((active: boolean) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAudio();
    }
  }

  private initAudio() {
    try {
      this.audio = new Audio(SILENT_WAV_BASE64);
      this.audio.loop = true;
      this.audio.volume = 0.01; // Inaudible
    } catch (err) {
      console.warn('BackgroundRunner: Audio init warning:', err);
    }
  }

  public onStateChange(callback: (active: boolean) => void) {
    this.onStateChangeCallback = callback;
  }

  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    try {
      if (!this.audio) {
        this.initAudio();
      }

      if (this.audio) {
        await this.audio.play();
      }

      // Configure Android / iOS Media Session notification
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Nexus Family Tracker',
          artist: 'Eco Background Location Active (10s intervals)',
          album: 'Family Safety',
          artwork: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => {
          this.start();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.stop();
        });
      }

      // NOTE: We do NOT hold Screen WakeLock here so the phone screen
      // can sleep naturally in pockets, saving 80% battery!
      this.isRunning = true;
      this.onStateChangeCallback?.(true);
      return true;
    } catch (err) {
      console.warn('BackgroundRunner: Failed to start background audio lock:', err);
      this.isRunning = false;
      this.onStateChangeCallback?.(false);
      return false;
    }
  }

  public stop() {
    this.isRunning = false;

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {}
    }

    this.onStateChangeCallback?.(false);
  }

  public get isActive(): boolean {
    return this.isRunning;
  }
}

export const backgroundRunner = new BackgroundLocationRunner();
