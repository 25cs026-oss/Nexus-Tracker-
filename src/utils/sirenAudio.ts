/**
 * Nexus Emergency Siren & Haptic Alert Engine
 * 
 * Synthesizes a high-urgency multi-tone emergency siren using the Web Audio API
 * and triggers native device vibration patterns (SOS Morse code / emergency pulse).
 */

export class SirenAudioEngine {
  private audioCtx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private isPlaying: boolean = false;
  private vibrationInterval: number | null = null;

  public start() {
    if (this.isPlaying) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      // Primary siren oscillator
      this.osc = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      // Sawtooth waveform gives piercing urgency
      this.osc.type = 'sawtooth';
      this.osc.frequency.setValueAtTime(700, this.audioCtx.currentTime);

      // Low Frequency Oscillator (LFO) to modulate pitch: wailing effect (600Hz <-> 950Hz)
      this.lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();
      this.lfo.frequency.setValueAtTime(2.2, this.audioCtx.currentTime); // 2.2 sweeps per second
      lfoGain.gain.setValueAtTime(250, this.audioCtx.currentTime); // +/- 250Hz swing

      this.lfo.connect(lfoGain);
      lfoGain.connect(this.osc.frequency);

      // Volume control
      this.gainNode.gain.setValueAtTime(0.25, this.audioCtx.currentTime);

      this.osc.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.osc.start();
      this.lfo.start();
      this.isPlaying = true;

      // Haptic Vibration: Emergency pulse
      this.startVibration();
    } catch (err) {
      console.warn('SirenAudioEngine: AudioContext failed or blocked by autoplay:', err);
    }
  }

  private startVibration() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([400, 150, 400, 150, 800]);
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        this.vibrationInterval = window.setInterval(() => {
          if (this.isPlaying && 'vibrate' in navigator) {
            navigator.vibrate([400, 150, 400, 150, 800]);
          }
        }, 2200);
      } catch {}
    }
  }

  public stop() {
    this.isPlaying = false;

    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }

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
}

export const sirenAudio = new SirenAudioEngine();
