/**
 * Nexus Tactical Radio & Video Call Audio Synthesizer
 * 
 * Provides authentic tactical walkie-talkie chirps, squelch roger beeps,
 * and high-tech call signaling using the Web Audio API. Zero external assets required.
 */

class RadioAudioEngine {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: number | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.ctx && AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Authentic Motorola/Mil-Spec PTT Start Chirp (Mic Key Down)
   * Rapid ascending frequency burst with high-pass attack.
   */
  public playPttStartChirp() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Tone 1: 1050Hz to 1750Hz rapid sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, now);
      osc.frequency.exponentialRampToValueAtTime(1850, now + 0.045);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);

      // Secondary click tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2200, now + 0.05);
      osc2.frequency.setValueAtTime(2400, now + 0.08);

      gain2.gain.setValueAtTime(0.2, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.05);
      osc2.stop(now + 0.11);
    } catch (e) {
      console.warn('PTT start chirp audio error:', e);
    }
  }

  /**
   * Authentic Mil-Spec Roger Beep & Squelch Tail (Mic Key Up / Over)
   * NASA / Military classic 1440Hz roger tone followed by 40ms radio squelch static.
   */
  public playRogerBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Crisp Roger Beep tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1440, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.setValueAtTime(0.25, now + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);

      // 2. Radio Squelch Tail Noise burst (white noise through bandpass)
      const bufferSize = Math.floor(ctx.sampleRate * 0.06); // 60ms noise
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.15;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now + 0.08);
      filter.Q.setValueAtTime(1.5, now + 0.08);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.12, now + 0.08);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now + 0.08);
      whiteNoise.stop(now + 0.15);
    } catch (e) {
      console.warn('Roger beep audio error:', e);
    }
  }

  /**
   * Incoming Tactical Video/Radio Call Ringtone Loop
   */
  public startIncomingCallRingtone() {
    if (this.ringtoneInterval !== null) return;

    const playPulse = () => {
      const ctx = this.getContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;

        // Dual frequency tactical alert chime (520Hz + 660Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(520, now);
        osc2.frequency.setValueAtTime(660, now);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.setValueAtTime(0.2, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);

        // Echo chirp at +0.55s
        const echoOsc1 = ctx.createOscillator();
        const echoOsc2 = ctx.createOscillator();
        const echoGain = ctx.createGain();

        echoOsc1.type = 'sine';
        echoOsc2.type = 'sine';
        echoOsc1.frequency.setValueAtTime(660, now + 0.55);
        echoOsc2.frequency.setValueAtTime(820, now + 0.55);

        echoGain.gain.setValueAtTime(0.01, now + 0.55);
        echoGain.gain.linearRampToValueAtTime(0.22, now + 0.6);
        echoGain.gain.setValueAtTime(0.22, now + 0.9);
        echoGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

        echoOsc1.connect(echoGain);
        echoOsc2.connect(echoGain);
        echoGain.connect(ctx.destination);

        echoOsc1.start(now + 0.55);
        echoOsc2.start(now + 0.55);
        echoOsc1.stop(now + 1.05);
        echoOsc2.stop(now + 1.05);
      } catch (err) {
        console.warn('Ringtone pulse error:', err);
      }
    };

    playPulse();
    this.ringtoneInterval = window.setInterval(playPulse, 2600);
  }

  public stopIncomingCallRingtone() {
    if (this.ringtoneInterval !== null) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  /**
   * Call Connected Affirmation Sound
   */
  public playCallConnected() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.01, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.16);
      });
    } catch {}
  }

  /**
   * Call Ended / Busy Tone
   */
  public playCallEndTone() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [880, 660, 440];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.09;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.09);
      });
    } catch {}
  }
}

export const radioAudio = new RadioAudioEngine();
