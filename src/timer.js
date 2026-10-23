/**
 * Team Guessing Phase Sand Timer
 * Manages countdown, play/pause, time extensions (+30s), ticks, and buzzer alerts.
 */
import { sounds } from "./audio.js";

class SandTimer {
  constructor() {
    this.totalSeconds = 120;
    this.remainingSeconds = 120;
    this.isRunning = false;
    this.isExpired = false;
    this.intervalId = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  notify() {
    const data = {
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds,
      isRunning: this.isRunning,
      isExpired: this.isExpired,
      formattedTime: this.formatTime(this.remainingSeconds),
      percentage: this.totalSeconds > 0 ? (this.remainingSeconds / this.totalSeconds) * 100 : 0
    };
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (_) {}
    }
  }

  init(seconds) {
    this.stop();
    this.totalSeconds = Math.max(0, seconds);
    this.remainingSeconds = this.totalSeconds;
    this.isExpired = false;
    this.isRunning = false;
    this.notify();
  }

  start(seconds) {
    if (typeof seconds === "number") {
      this.init(seconds);
    }
    if (this.totalSeconds <= 0) return;

    this.isRunning = true;
    this.isExpired = false;
    this.clearInterval();

    this.intervalId = setInterval(() => {
      if (!this.isRunning) return;

      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;

        // Sound cues
        if (this.remainingSeconds <= 5 && this.remainingSeconds > 0) {
          sounds.tick();
        } else if (this.remainingSeconds === 0) {
          this.isExpired = true;
          this.isRunning = false;
          this.clearInterval();
          sounds.timerBuzzer();
        }

        this.notify();
      } else {
        this.stop();
      }
    }, 1000);

    this.notify();
  }

  pause() {
    this.isRunning = false;
    this.clearInterval();
    this.notify();
  }

  resume() {
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = this.totalSeconds;
      this.isExpired = false;
    }
    this.isRunning = true;
    this.clearInterval();

    this.intervalId = setInterval(() => {
      if (!this.isRunning) return;

      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;

        if (this.remainingSeconds <= 5 && this.remainingSeconds > 0) {
          sounds.tick();
        } else if (this.remainingSeconds === 0) {
          this.isExpired = true;
          this.isRunning = false;
          this.clearInterval();
          sounds.timerBuzzer();
        }

        this.notify();
      } else {
        this.stop();
      }
    }, 1000);

    this.notify();
  }

  toggle() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.resume();
    }
  }

  addSeconds(extra = 30) {
    this.remainingSeconds += extra;
    if (this.remainingSeconds > this.totalSeconds) {
      this.totalSeconds = this.remainingSeconds;
    }
    if (this.isExpired) {
      this.isExpired = false;
      this.resume();
    } else {
      this.notify();
    }
  }

  reset() {
    this.stop();
    this.remainingSeconds = this.totalSeconds;
    this.isExpired = false;
    this.notify();
  }

  stop() {
    this.isRunning = false;
    this.clearInterval();
    this.notify();
  }

  clearInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  formatTime(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
}

export const sandTimer = new SandTimer();
