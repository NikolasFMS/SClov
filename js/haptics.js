/**
 * Haptic Feedback Controller using Web Vibration API
 * Gracefully degrades on unsupported browsers (e.g. iOS Safari).
 */
import { state } from "./state.js";

class HapticFeedback {
  vibrate(pattern) {
    if (state.vibrationEnabled === false) return false;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        return navigator.vibrate(pattern);
      }
    } catch (_) {}
    return false;
  }

  tap() {
    this.vibrate(12);
  }

  rotate() {
    this.vibrate(18);
  }

  place() {
    this.vibrate(22);
  }

  dragStart() {
    this.vibrate(15);
  }

  dragHover() {
    this.vibrate(8);
  }

  success() {
    this.vibrate([35, 45, 70]);
  }

  miss() {
    this.vibrate([60, 40, 60]);
  }

  fanfare() {
    this.vibrate([40, 40, 40, 40, 100]);
  }

  timerTick() {
    this.vibrate(25);
  }

  timerEnd() {
    this.vibrate([140, 80, 140, 80, 220]);
  }
}

export const haptics = new HapticFeedback();
