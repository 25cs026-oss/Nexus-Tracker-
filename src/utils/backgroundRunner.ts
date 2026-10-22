/**
 * Nexus Background Location Runner
 * 
 * Multi-layer background persistence engine:
 * 1. Generates a valid 10-second sub-audible (25Hz) PCM WAV track
 * 2. Runs HTML5 Audio loop + Web Audio API Oscillator
 * 3. Registers Android MediaSession notification in notification drawer
 * 4. Runs an isolated Web Worker heartbeat timer that CANNOT be throttled by mobile Chrome
 * 5. Integrates with Web Notification API to pin ongoing status in Android notification bar
 */

import { notificationManager } from './notificationManager';

/**
 * Creates a valid PCM WAV blob with sub-audible frequency (25Hz).
 * Mobile Chrome requires real PCM samples and duration to activate MediaSession
 * and grant background execution wake locks.
 */
function generateSubAudibleWavBlob(durationSeconds = 10, sampleRate = 22050): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const numSamples = durationSeconds * sampleRate;
  const dataSize = numSamples * blockAlign;
  const totalSize = 44 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Write ASCII string helper
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // "fmt " Sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" Sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 25 Hz sub-audible sine wave (imperceptible, but recognized by OS as active audio)
  const amplitude = 60; // Inaudible (0.18% of 32767)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 25 * t) * amplitude;
    view.setInt16(44 + i * 2, Math.round(sample), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Inline Web Worker script that runs unthrottled in an isolated OS background thread
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
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private worker: Worker | null = null;
  private isRunning: boolean = false;
  private onStateChangeCallback: ((active: boolean) => void) | null = null;
  private onHeartbeatCallback: (() => void) | null = null;
  private hasArmedGestureListener: boolean = false;
  private fallbackInterval: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initWorker();
      this.initAudio();
    }
  }

  private initWorker() {
    try {
      if (typeof window !== 'undefined' && 'Worker' in window) {
        const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = (e) => {
          if (e.data === 'TICK' && this.isRunning) {
            // Heartbeat received from unthrottled background worker thread!
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
    try {
      const wavBlob = generateSubAudibleWavBlob(10, 22050);
      const audioUrl = URL.createObjectURL(wavBlob);

      this.audio = new Audio(audioUrl);
      this.audio.loop = true;
      this.audio.volume = 0.05; // Effectively inaudible, but registers with AudioFlinger

      // Keep playing if interrupted by system
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

  private initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      if (!this.oscillator) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(25, this.audioContext.currentTime); // 25Hz sub-bass
        gain.gain.setValueAtTime(0.002, this.audioContext.currentTime);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        this.oscillator = osc;
      }
    } catch (err) {
      console.warn('BackgroundRunner: AudioContext init error:', err);
    }
  }

  private ensureAudioPlaying() {
    if (!this.isRunning) return;

    if (this.audio && this.audio.paused) {
      this.audio.play().catch(() => {});
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
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
   * If mobile browser autoplay policy blocks audio initially,
   * arms a one-shot window listener so the very first touch/tap activates it.
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
    if (this.isRunning && this.audio && !this.audio.paused) return true;

    try {
      if (!this.audio) {
        this.initAudio();
      }

      if (this.audio) {
        await this.audio.play();
      }

      // Initialize secondary Web Audio API Oscillator
      this.initAudioContext();

      // Configure Android / iOS Media Session notification in the notification bar
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Nexus Family Tracker',
          artist: '🟢 Live Background Location Active (10s GPS)',
          album: 'Family Safety & Sharing',
          artwork: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        });

        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
          this.start();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.start(); // Keep active
        });
        try {
          navigator.mediaSession.setActionHandler('stop', () => {
            this.stop();
          });
        } catch {}
      }

      // Start unthrottled Web Worker heartbeat
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
      console.warn('BackgroundRunner: Waiting for first user touch to unlock audio session:', err);
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

    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {}
      this.oscillator = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.suspend().catch(() => {});
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
