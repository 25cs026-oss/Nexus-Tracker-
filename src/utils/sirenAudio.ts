/**
 * Nexus Emergency Siren & Haptic Alert Engine
 * 
 * Dual-Engine sound architecture:
 * 1. HTML5 Audio element playing synthesized 6s alternating emergency ambulance/police siren WAV
 *    (Guaranteed playback in background / screen-off through mobile OS media routing).
 * 2. Web Audio API synthesized saw-tooth LFO siren for foreground punch.
 * 3. High-urgency device vibration pattern ([500ms, 200ms, 500ms, 200ms, 800ms]).
 */

function createLoudSirenWavBlob(durationSeconds = 6, sampleRate = 22050): Blob {
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

  // Generate alternating 700Hz and 960Hz loud emergency ambulance/police siren
  const maxAmp = 25000; // ~76% max digital amplitude
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const isHigh = Math.floor(t * 2.5) % 2 === 0;
    const freq = isHigh ? 960 : 700;
    const sample = Math.sin(2 * Math.PI * freq * t) * maxAmp;
    view.setInt16(44 + i * 2, Math.round(sample), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export class SirenAudioEngine {
  private audioElement: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private isPlaying: boolean = false;
  private vibrationInterval: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const blob = createLoudSirenWavBlob(6, 22050);
        this.audioElement = new Audio(URL.createObjectURL(blob));
        this.audioElement.loop = true;
        this.audioElement.volume = 0.95; // Loud emergency alarm volume
      } catch (e) {
        console.warn('SirenAudioEngine audio element init error:', e);
      }
    }
  }

  public start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // 1. Primary: HTML5 Audio playback (Survives screen-off / background)
    if (this.audioElement) {
      try {
        this.audioElement.currentTime = 0;
        this.audioElement.play().catch(err => {
          console.warn('HTML5 Siren playback blocked:', err);
        });
      } catch {}
    }

    // 2. Secondary: Web Audio API Oscillator for piercing tone
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }

        this.osc = this.audioCtx.createOscillator();
        this.gainNode = this.audioCtx.createGain();
        this.osc.type = 'sawtooth';
        this.osc.frequency.setValueAtTime(700, this.audioCtx.currentTime);

        this.lfo = this.audioCtx.createOscillator();
        const lfoGain = this.audioCtx.createGain();
        this.lfo.frequency.setValueAtTime(2.5, this.audioCtx.currentTime);
        lfoGain.gain.setValueAtTime(260, this.audioCtx.currentTime);

        this.lfo.connect(lfoGain);
        lfoGain.connect(this.osc.frequency);

        this.gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        this.osc.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        this.osc.start();
        this.lfo.start();
      }
    } catch {}

    // 3. Native Device Vibration
    this.startVibration();
  }

  private startVibration() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500, 200, 800]);
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        this.vibrationInterval = window.setInterval(() => {
          if (this.isPlaying && 'vibrate' in navigator) {
            navigator.vibrate([500, 200, 500, 200, 500, 200, 800]);
          }
        }, 2500);
      } catch {}
    }
  }

  public stop() {
    this.isPlaying = false;

    // Stop HTML5 Audio
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }

    // Stop Vibration
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }

    // Stop Web Audio API
    try {
      if (this.osc) {
        this.osc.stop();
        this.osc.disconnect();
        this.osc = null;
      }
      if (this.lfo) {
        this.lfo.stop();
        this.lfo.disconnect();
        this.lfo = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
    } catch {}
  }

  public get active(): boolean {
    return this.isPlaying;
  }

  /**
   * Plays a pleasant 2-tone melodic notification chime for incoming family check-ins
   */
  public playChime() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => {
        if (ctx.state !== 'closed') ctx.close().catch(() => {});
      }, 600);
    } catch {}
  }
}

export const sirenAudio = new SirenAudioEngine();
