/**
 * Nexus Tactical Radio & Video Call Audio Synthesizer
 * 
 * Provides authentic tactical walkie-talkie chirps, roger beeps,
 * and high-tech call signaling using the Web Audio API. Zero external assets required.
 */

class RadioAudioEngine {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: number | null = null;
  private activeRingtoneNodes: Set<{ stop: () => void; disconnect: () => void }> = new Set();

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
   * Soft Tactile PTT Mic Key-Down Chirp (Mic Open)
   * Subtle high-frequency chirp at low volume so it NEVER bleeds into the microphone.
   */
  public playPttStartChirp() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.035);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      console.warn('PTT start chirp audio error:', e);
    }
  }

  /**
   * Authentic Roger Beep (Mic Key-Up / Transmission End)
   * Crisp, soft 1350Hz tone with rapid decay.
   */
  public playRogerBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1350, now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {
      console.warn('Roger beep audio error:', e);
    }
  }

  /**
   * Incoming Tactical Video/Radio Call Ringtone Loop
   * Dual-frequency chime that cleanly stops the instant call is answered or declined.
   */
  public startIncomingCallRingtone() {
    this.stopIncomingCallRingtone();

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
        gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
        gain.gain.setValueAtTime(0.12, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        const node1 = {
          stop: () => { try { osc1.stop(); } catch {} },
          disconnect: () => { try { osc1.disconnect(); } catch {} }
        };
        const node2 = {
          stop: () => { try { osc2.stop(); } catch {} },
          disconnect: () => { try { osc2.disconnect(); } catch {} }
        };

        this.activeRingtoneNodes.add(node1);
        this.activeRingtoneNodes.add(node2);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.42);
        osc2.stop(now + 0.42);

        setTimeout(() => {
          this.activeRingtoneNodes.delete(node1);
          this.activeRingtoneNodes.delete(node2);
        }, 450);

        // Echo chirp at +0.5s
        const echoOsc1 = ctx.createOscillator();
        const echoOsc2 = ctx.createOscillator();
        const echoGain = ctx.createGain();

        echoOsc1.type = 'sine';
        echoOsc2.type = 'sine';
        echoOsc1.frequency.setValueAtTime(660, now + 0.5);
        echoOsc2.frequency.setValueAtTime(820, now + 0.5);

        echoGain.gain.setValueAtTime(0.01, now + 0.5);
        echoGain.gain.linearRampToValueAtTime(0.12, now + 0.54);
        echoGain.gain.setValueAtTime(0.12, now + 0.8);
        echoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

        echoOsc1.connect(echoGain);
        echoOsc2.connect(echoGain);
        echoGain.connect(ctx.destination);

        const echoNode1 = {
          stop: () => { try { echoOsc1.stop(); } catch {} },
          disconnect: () => { try { echoOsc1.disconnect(); } catch {} }
        };
        const echoNode2 = {
          stop: () => { try { echoOsc2.stop(); } catch {} },
          disconnect: () => { try { echoOsc2.disconnect(); } catch {} }
        };

        this.activeRingtoneNodes.add(echoNode1);
        this.activeRingtoneNodes.add(echoNode2);

        echoOsc1.start(now + 0.5);
        echoOsc2.start(now + 0.5);
        echoOsc1.stop(now + 0.92);
        echoOsc2.stop(now + 0.92);

        setTimeout(() => {
          this.activeRingtoneNodes.delete(echoNode1);
          this.activeRingtoneNodes.delete(echoNode2);
        }, 950);
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
    this.activeRingtoneNodes.forEach(node => {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    });
    this.activeRingtoneNodes.clear();
  }

  /**
   * Call Connected Affirmation Sound (Pleasant soft 3-note ascending chime)
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
        const start = now + idx * 0.07;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.01, start);
        gain.gain.linearRampToValueAtTime(0.09, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.15);
      });
    } catch {}
  }

  /**
   * Resume AudioContext on any user interaction (satisfies browser Autoplay policies)
   */
  public resumeContext() {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  /**
   * Call Ended Tone (Soft 2-note descending tone)
   */
  public playCallEndTone() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [660, 440];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.06, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.08);
      });
    } catch {}
  }
}

export const radioAudio = new RadioAudioEngine();
