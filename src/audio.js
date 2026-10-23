/**
 * Audio Synthesizer using Web Audio API
 * Zero external audio assets required.
 */
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  playTone(freq, duration = 0.08, type = "sine", gainVal = 0.15) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (_) {}
  }

  tap() {
    this.playTone(880, 0.04, "triangle", 0.08);
  }

  rotate() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(380, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(720, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch (_) {}
  }

  place() {
    this.playTone(520, 0.06, "sine", 0.14);
  }

  success() {
    // Triumphant chord
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.22, "triangle", 0.12), i * 75);
    });
  }

  miss() {
    // Descending soft tones
    this.playTone(420, 0.14, "sawtooth", 0.08);
    setTimeout(() => this.playTone(310, 0.18, "sawtooth", 0.08), 120);
  }

  fanfare() {
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.35, "triangle", 0.15), i * 110);
    });
  }

  tick() {
    // Crisp subtle tick for countdown timer
    this.playTone(1200, 0.02, "triangle", 0.05);
  }

  timerBuzzer() {
    // Distinctive pleasant time-up chime / alert
    try {
      this.init();
      if (!this.ctx) return;
      [587.33, 523.25, 440].forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq, 0.22, "sine", 0.14);
        }, idx * 160);
      });
    } catch (_) {}
  }
}

export const sounds = new SoundEffects();
