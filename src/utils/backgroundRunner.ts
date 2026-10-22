/**
 * Nexus Background Location Runner
 * 
 * Uses HTML5 Audio Loop + MediaSession API + Autoplay User-Gesture Hook
 * to keep GPS tracking alive in the background when phone screen is locked
 * or switching apps, without forcing screen to stay awake (minimizing battery usage).
 * 
 * Works 100% automatically with zero manual clicks required.
 */

// 1-second silent WAV audio
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABkYXRhEgAAAAEAAQCg/6D/oP+g/6D/';

export class BackgroundLocationRunner {
  private audio: HTMLAudioElement | null = null;
  private isRunning: boolean = false;
  private onStateChangeCallback: ((active: boolean) => void) | null = null;
  private onHeartbeatCallback: (() => void) | null = null;
  private heartbeatInterval: number | null = null;
  private hasArmedGestureListener: boolean = false;

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

      // Auto-recover if paused by system/phone call while marked running
      this.audio.addEventListener('pause', () => {
        if (this.isRunning && this.audio && this.audio.paused) {
          this.audio.play().catch(() => {});
        }
      });

      this.audio.addEventListener('ended', () => {
        if (this.isRunning && this.audio) {
          this.audio.play().catch(() => {});
        }
      });
    } catch (err) {
      console.warn('BackgroundRunner: Audio init warning:', err);
    }
  }

  public onStateChange(callback: (active: boolean) => void) {
    this.onStateChangeCallback = callback;
  }

  public onHeartbeat(callback: () => void) {
    this.onHeartbeatCallback = callback;
  }

  /**
   * Automatically start background service.
   * If browser autoplay restrictions block it initially,
   * arms a one-shot window listener so the VERY FIRST user touch
   * or tap activates it without requiring any button clicks.
   */
  public autoStart() {
    if (this.isRunning) return;

    this.start().catch(() => {
      this.armGestureActivation();
    });

    if (!this.hasArmedGestureListener) {
      this.armGestureActivation();
    }
  }

  private armGestureActivation() {
    if (this.hasArmedGestureListener || typeof window === 'undefined') return;
    this.hasArmedGestureListener = true;

    const onUserGesture = () => {
      if (!this.isRunning) {
        this.start().then((ok) => {
          if (ok) {
            removeListeners();
          }
        }).catch(() => {});
      } else {
        removeListeners();
      }
    };

    const removeListeners = () => {
      window.removeEventListener('touchstart', onUserGesture);
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('click', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
      this.hasArmedGestureListener = false;
    };

    window.addEventListener('touchstart', onUserGesture, { passive: true });
    window.addEventListener('pointerdown', onUserGesture, { passive: true });
    window.addEventListener('click', onUserGesture, { passive: true });
    window.addEventListener('keydown', onUserGesture, { passive: true });
  }

  public async start(): Promise<boolean> {
    if (this.isRunning && this.audio && !this.audio.paused) return true;

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
          artist: '🟢 Background Location Active (Eco 10s)',
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
          // Keep active or restart
          this.start();
        });
        try {
          navigator.mediaSession.setActionHandler('stop', () => {
            this.stop();
          });
        } catch {}
      }

      // Setup Heartbeat Timer (fires every 15s to guarantee location updates)
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = window.setInterval(() => {
        if (this.isRunning) {
          // Double check audio is playing to keep background JS thread alive
          if (this.audio && this.audio.paused) {
            this.audio.play().catch(() => {});
          }
          this.onHeartbeatCallback?.();
        }
      }, 15000);

      this.isRunning = true;
      try {
        localStorage.setItem('nexus_auto_bg', 'true');
      } catch {}
      this.onStateChangeCallback?.(true);
      return true;
    } catch (err) {
      console.warn('BackgroundRunner: Autoplay locked waiting for interaction:', err);
      this.armGestureActivation();
      return false;
    }
  }

  public stop() {
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {}
    }

    try {
      localStorage.setItem('nexus_auto_bg', 'false');
    } catch {}

    this.onStateChangeCallback?.(false);
  }

  public get isActive(): boolean {
    return this.isRunning;
  }
}

export const backgroundRunner = new BackgroundLocationRunner();
