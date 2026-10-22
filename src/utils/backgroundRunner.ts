/**
 * Nexus Background Location Runner
 * 
 * Uses HTML5 Audio Loop + MediaSession API + WakeLock API to keep
 * GPS tracking alive when the phone is locked, in the pocket, or switching apps.
 */

// 1-second silent WAV audio
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABkYXRhEgAAAAEAAQCg/6D/oP+g/6D/oP+g/6D/';

export class BackgroundLocationRunner {
  private audio: HTMLAudioElement | null = null;
  private isRunning: boolean = false;
  private wakeLock: any = null;
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
          artist: 'Live GPS Tracking Active in Background',
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

      // Try acquiring Screen Wake Lock (Trip Mode)
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          this.wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }

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

    if (this.wakeLock) {
      try {
        this.wakeLock.release();
        this.wakeLock = null;
      } catch {}
    }

    this.onStateChangeCallback?.(false);
  }

  public get isActive(): boolean {
    return this.isRunning;
  }
}

export const backgroundRunner = new BackgroundLocationRunner();
