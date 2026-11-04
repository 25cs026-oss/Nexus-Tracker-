/**
 * Nexus Background Location Runner
 * 
 * Multi-layer background persistence engine:
 * 1. Runs an isolated Web Worker heartbeat timer that CANNOT be throttled by mobile Chrome
 * 2. Integrates with Web Notification API to pin ongoing status in Android notification bar
 * 3. In mobile web browsers, safely keeps background loop active without speaker engagement
 * 4. Strictly ZERO audio output while the app is in the foreground, and ZERO audio in native APK
 */

import { notificationManager } from './notificationManager';

/**
 * Creates a valid PCM WAV blob with zero digital amplitude.
 */
function generateSubAudibleWavBlob(durationSeconds = 5, sampleRate = 22050): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const numSamples = durationSeconds * sampleRate;
  const dataSize = numSamples * blockAlign;
  const totalSize = 44 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 100% pure silence (all 0 samples)
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, 0, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Inline Web Worker script that runs unthrottled in an isolated background thread
const WORKER_SCRIPT = `
  let timer = null;
  self.onmessage = function(e) {
    if (e.data === 'START') {
      if (timer) clearInterval(timer);
      timer = setInterval(function() {
        self.postMessage('TICK');
      }, 10000);
    } else if (e.data === 'STOP') {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
`;

export class BackgroundLocationRunner {
  private audio: HTMLAudioElement | null = null;
  private worker: Worker | null = null;
  private isRunning: boolean = false;
  private onStateChangeCallback: ((active: boolean) => void) | null = null;
  private onHeartbeatCallback: (() => void) | null = null;
  private hasArmedGestureListener: boolean = false;
  private fallbackInterval: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initWorker();
      this.setupVisibilityListener();
    }
  }

  private isNativeApp(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      (window as any).NexusNative !== undefined ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:'
    );
  }

  private setupVisibilityListener() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // App is visible in foreground: NEVER keep audio playing
        if (this.audio && !this.audio.paused) {
          try { this.audio.pause(); } catch {}
        }
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
      } else if (document.visibilityState === 'hidden' && this.isRunning && !this.isNativeApp()) {
        // Screen off or backgrounded in mobile web browser: resume silent loop only to keep WebWorker alive
        if (this.audio && this.audio.paused) {
          this.audio.play().catch(() => {});
        }
      }
    });
  }

  private initWorker() {
    try {
      if (typeof window !== 'undefined' && 'Worker' in window) {
        const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = (e) => {
          if (e.data === 'TICK' && this.isRunning) {
            this.ensureAudioPlaying();
            this.onHeartbeatCallback?.();
          }
        };
      }
    } catch (err) {
      console.warn('BackgroundRunner: Worker initialization skipped:', err);
    }
  }

  private initAudio() {
    if (this.isNativeApp()) return; // Native Android APK NEVER needs HTML5 audio tricks
    try {
      const wavBlob = generateSubAudibleWavBlob(5, 22050);
      const audioUrl = URL.createObjectURL(wavBlob);

      this.audio = new Audio(audioUrl);
      this.audio.loop = true;
      this.audio.muted = true;
      this.audio.volume = 0; // Pure silence, hardware speakers are NEVER engaged

      this.audio.addEventListener('pause', () => {
        if (this.isRunning && this.audio && this.audio.paused && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          this.audio.play().catch(() => {});
        }
      });

      this.audio.addEventListener('ended', () => {
        if (this.isRunning && this.audio && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          this.audio.play().catch(() => {});
        }
      });
    } catch (err) {
      console.warn('BackgroundRunner: Audio init warning:', err);
    }
  }

  private ensureAudioPlaying() {
    if (!this.isRunning) return;
    // Strictly zero audio in foreground or native APK
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    if (this.isNativeApp()) return;

    if (this.audio && this.audio.paused) {
      this.audio.play().catch(() => {});
    }
  }

  public onStateChange(callback: (active: boolean) => void) {
    this.onStateChangeCallback = callback;
  }

  public onHeartbeat(callback: () => void) {
    this.onHeartbeatCallback = callback;
  }

  /**
   * Automatic zero-click startup.
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
          if (ok) removeListeners();
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
    if (this.isRunning) return true;

    try {
      // In mobile web only, initialize silent audio tag for background persistence
      if (!this.isNativeApp() && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        if (!this.audio) {
          this.initAudio();
        }
        if (this.audio && this.audio.paused) {
          await this.audio.play().catch(() => {});
        }
      }

      // Start unthrottled Web Worker heartbeat (100% silent JS thread)
      if (this.worker) {
        this.worker.postMessage('START');
      }

      // Fallback main thread interval (every 10s)
      if (this.fallbackInterval) clearInterval(this.fallbackInterval);
      this.fallbackInterval = window.setInterval(() => {
        if (this.isRunning) {
          this.ensureAudioPlaying();
          this.onHeartbeatCallback?.();
        }
      }, 10000);

      // Pin Web Notification in Android status bar / notification drawer
      notificationManager.showLiveTrackingNotification().catch(() => {});

      this.isRunning = true;
      try {
        localStorage.setItem('nexus_auto_bg', 'true');
      } catch {}
      this.onStateChangeCallback?.(true);
      return true;
    } catch (err) {
      console.warn('BackgroundRunner: Waiting for first user touch to unlock background session:', err);
      this.armGestureActivation();
      return false;
    }
  }

  public stop() {
    this.isRunning = false;

    if (this.worker) {
      this.worker.postMessage('STOP');
    }

    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {}
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }

    notificationManager.clearNotification().catch(() => {});

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
