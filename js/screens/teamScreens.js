/**
 * Team Screens Controller
 * Handles team handoff, team guessing, sand timer integration, card tray,
 * double-tap rotation, tray shuffling, reload recovery, and solution evaluation.
 */
import { state, saveState, getT } from "../state.js";
import { renderCloverBoard } from "../components/boardRenderer.js";
import { renderCardHtml } from "../components/cardRenderer.js";
import { shuffle } from "../gameLogic.js";
import { sounds } from "../audio.js";
import { haptics } from "../haptics.js";
import { sandTimer } from "../timer.js";

let timerUnsubscribe = null;
let lastRotatedTeamCardId = null;
let justShuffledTray = false;
let registeredCallbacks = {};

// Double-tap state for card rotation without fighting single-tap actions
let pendingCardTap = null;
const DOUBLE_TAP_WINDOW_MS = 220;

export function setTeamScreenCallbacks(callbacks = {}) {
  registeredCallbacks = { ...registeredCallbacks, ...callbacks };
}

function formatHearts(lives, maxLives) {
  const filled = Math.max(0, Math.min(maxLives, lives));
  return "❤️".repeat(filled) + "🖤".repeat(Math.max(0, maxLives - filled));
}

function isBlitzRound(round) {
  return Boolean(round && round.gameMode === "blitz");
}

function isTimerEnabledForRound(round) {
  if (isBlitzRound(round)) return true;
  return Boolean(state.timerSetting && state.timerSetting > 0);
}

export function cancelPendingCardTap() {
  if (pendingCardTap) {
    clearTimeout(pendingCardTap.timerId);
    pendingCardTap = null;
  }
}

export function renderTeamHandoffScreen() {
  const t = getT();
  const round = state.activeRound;
  const noteEl = document.getElementById("txtBlitzHandoffNote");
  if (!noteEl) return;

  if (isBlitzRound(round)) {
    const rem = typeof state.blitzRemainingSeconds === "number" ? state.blitzRemainingSeconds : state.blitzDuration;
    noteEl.textContent = t.blitzHandoffNote(sandTimer.formatTime(rem));
    noteEl.style.display = "block";
  } else {
    noteEl.style.display = "none";
  }
}

export function persistTimerSnapshot() {
  const round = state.activeRound;
  if (!round || !isTimerEnabledForRound(round)) return;
  if (state.screen !== "screenTeamGuessing") return;

  if (isBlitzRound(round)) {
    if (!state.blitzTimedOut) {
      state.blitzRemainingSeconds = Math.max(0, sandTimer.remainingSeconds);
      state.blitzTotalSeconds = Math.max(state.blitzTotalSeconds || state.blitzDuration, sandTimer.totalSeconds);
    }
    round.timerPaused = !sandTimer.isRunning && !sandTimer.isExpired && sandTimer.remainingSeconds > 0;
    saveState();
    return;
  }

  round.timerRemaining = sandTimer.remainingSeconds;
  round.timerTotalSeconds = sandTimer.totalSeconds;
  round.timerPaused = !sandTimer.isRunning && !sandTimer.isExpired && sandTimer.remainingSeconds > 0;
  saveState();
}

export function startTeamGuessingPhase() {
  const round = state.activeRound;
  if (!round) {
    sandTimer.stop();
    return;
  }

  if (isBlitzRound(round)) {
    const remaining =
      typeof state.blitzRemainingSeconds === "number" ? Math.max(0, state.blitzRemainingSeconds) : state.blitzDuration;
    const total =
      typeof state.blitzTotalSeconds === "number" && state.blitzTotalSeconds > 0
        ? Math.max(state.blitzTotalSeconds, remaining)
        : Math.max(state.blitzDuration, remaining);

    state.blitzRemainingSeconds = remaining;
    state.blitzTotalSeconds = total;

    sandTimer.init(total);
    sandTimer.remainingSeconds = remaining;

    if (round.pendingModal || state.blitzTimedOut) {
      sandTimer.isExpired = remaining === 0;
      sandTimer.isRunning = false;
      sandTimer.notify();
      return;
    }

    if (remaining <= 0) {
      sandTimer.isExpired = true;
      sandTimer.isRunning = false;
      sandTimer.notify();
      handleBlitzTimeExpired();
      return;
    }

    if (round.timerPaused) {
      sandTimer.isExpired = false;
      sandTimer.isRunning = false;
      sandTimer.notify();
    } else {
      sandTimer.resume();
    }
    return;
  }

  if (state.timerSetting && state.timerSetting > 0) {
    // If a result modal is waiting for user confirmation after reload, keep timer stopped
    if (round.pendingModal) {
      const savedTotal =
        typeof round.timerTotalSeconds === "number" && round.timerTotalSeconds > 0
          ? round.timerTotalSeconds
          : state.timerSetting;
      sandTimer.init(savedTotal);
      if (typeof round.timerRemaining === "number") {
        sandTimer.remainingSeconds = Math.max(0, round.timerRemaining);
        sandTimer.isExpired = round.timerRemaining === 0;
      }
      sandTimer.notify();
      return;
    }

    if (typeof round.timerRemaining === "number" && round.timerRemaining >= 0) {
      const savedTotal =
        typeof round.timerTotalSeconds === "number" && round.timerTotalSeconds > 0
          ? Math.max(round.timerTotalSeconds, round.timerRemaining)
          : Math.max(state.timerSetting, round.timerRemaining);

      sandTimer.init(savedTotal);
      sandTimer.remainingSeconds = round.timerRemaining;

      if (round.timerRemaining === 0) {
        sandTimer.isExpired = true;
        sandTimer.isRunning = false;
        sandTimer.notify();
      } else if (round.timerPaused) {
        sandTimer.isExpired = false;
        sandTimer.isRunning = false;
        sandTimer.notify();
      } else {
        sandTimer.resume();
      }
    } else {
      sandTimer.start(state.timerSetting);
      round.timerTotalSeconds = state.timerSetting;
      round.timerRemaining = state.timerSetting;
      round.timerPaused = false;
    }
  } else {
    sandTimer.stop();
  }
}

export function stopTeamGuessingPhase() {
  cancelPendingCardTap();
  if (state.screen === "screenTeamGuessing" && state.activeRound && isTimerEnabledForRound(state.activeRound)) {
    persistTimerSnapshot();
  }
  sandTimer.stop();
  if (timerUnsubscribe) {
    timerUnsubscribe();
    timerUnsubscribe = null;
  }
}

export function renderTeamGuessingScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  const trapsCount = Array.isArray(round.fakeCards)
    ? round.fakeCards.length
    : typeof round.distractorCount === "number"
      ? round.distractorCount
      : round.gameMode === "hard"
        ? 2
        : 1;

  setText("txtGuessingLeaderName", round.leaderName);
  setText("badgeAttemptNum", round.attempt === 1 ? t.attempt1of2 : t.attempt2of2);
  setText("txtTrayTitle", t.trayTitleDynamic(4 + trapsCount, trapsCount));

  const hudEl = document.getElementById("badgeModeHud");
  if (hudEl) {
    hudEl.className = "mode-hud-badge";
    if (round.gameMode === "marathon") {
      hudEl.textContent = formatHearts(state.marathonLives, state.marathonMaxLives);
      hudEl.classList.add("mode-hud-badge--marathon");
      hudEl.style.display = "inline-flex";
    } else if (round.gameMode === "hard") {
      hudEl.textContent = t.hardHudBadge(trapsCount);
      hudEl.classList.add("mode-hud-badge--hard");
      hudEl.style.display = "inline-flex";
    } else if (round.gameMode === "blitz") {
      hudEl.textContent = `⚡ ${t.gameModeBlitzTitle}`;
      hudEl.classList.add("mode-hud-badge--blitz");
      hudEl.style.display = "inline-flex";
    } else {
      hudEl.style.display = "none";
    }
  }

  // Setup Sand Timer Subscription if timer is active
  setupTimerUI();

  const rotatedId = lastRotatedTeamCardId;
  lastRotatedTeamCardId = null;

  // Render clover board for team
  const boardEl = document.getElementById("boardContainerTeam");
  renderCloverBoard(
    boardEl,
    {
      slots: round.teamBoard,
      clues: round.clues,
      showWordPreviews: false,
      canInteract: true,
      isLeaderMode: false,
      justRotatedCardId: rotatedId
    },
    state
  );

  // Render card tray
  const trayEl = document.getElementById("trayCardsContainer");
  if (trayEl) {
    if (round.trayCards.length === 0) {
      trayEl.innerHTML = `<div class="tray-empty-msg">${t.trayAllPlaced}</div>`;
    } else {
      trayEl.innerHTML = round.trayCards
        .map((item) =>
          renderCardHtml(
            item.card,
            item.rotation,
            {
              isLocked: false,
              isSelected: round.selectedTrayCardId === item.card.id,
              canRotate: true,
              inTray: true,
              isDraggable: true,
              justRotated: rotatedId === item.card.id
            },
            state.lang
          )
        )
        .join("");
    }

    if (justShuffledTray) {
      justShuffledTray = false;
      trayEl.classList.remove("just-shuffled");
      // Force reflow so rapid shuffles re-trigger animation
      void trayEl.offsetWidth;
      trayEl.classList.add("just-shuffled");
    }
  }

  // Shuffle button state
  const btnShuffle = document.getElementById("btnShuffleTray");
  if (btnShuffle) {
    btnShuffle.disabled = round.trayCards.length <= 1;
  }

  // Check solution button state
  const filledSlots = round.teamBoard.filter((s) => s && s.card).length;
  const btnCheck = document.getElementById("btnCheckSolution");
  const txtCheck = document.getElementById("txtCheckSolutionBtn");

  if (filledSlots === 4) {
    if (btnCheck) btnCheck.disabled = false;
    if (txtCheck) txtCheck.textContent = t.btnCheckSolution;
  } else {
    if (btnCheck) btnCheck.disabled = true;
    if (txtCheck) txtCheck.textContent = t.btnFillAllSlots;
  }
}

function setupTimerUI() {
  const timerWidget = document.getElementById("timerWidget");
  if (!timerWidget) return;

  const round = state.activeRound;
  if (!isTimerEnabledForRound(round)) {
    timerWidget.style.display = "none";
    return;
  }

  const blitz = isBlitzRound(round);
  timerWidget.style.display = "flex";
  timerWidget.classList.toggle("timer-widget--blitz", blitz);

  const btnAdd30 = document.getElementById("btnTimerAdd30");
  if (btnAdd30) {
    btnAdd30.style.display = blitz ? "none" : "inline-flex";
  }

  const hourglassEl = document.getElementById("timerHourglass");
  if (hourglassEl) {
    hourglassEl.textContent = blitz ? "⚡" : "⏳";
  }

  if (!timerUnsubscribe) {
    timerUnsubscribe = sandTimer.subscribe((data) => {
      updateTimerDisplay(data);
    });
  } else {
    sandTimer.notify();
  }
}

function handleBlitzTimeExpired() {
  const round = state.activeRound;
  if (!round || !isBlitzRound(round) || round.pendingModal || state.blitzTimedOut) return;

  cancelPendingCardTap();
  sandTimer.stop();

  let correctCount = 0;
  for (let i = 0; i < 4; i++) {
    const teamSlot = round.teamBoard[i];
    const secretSlot = round.secretBoard[i];
    if (teamSlot && teamSlot.card && secretSlot && secretSlot.card) {
      if (teamSlot.card.id === secretSlot.card.id && teamSlot.rotation === secretSlot.rotation) {
        correctCount++;
      }
    }
  }

  const finalPoints = correctCount;
  round.lastRoundPoints = finalPoints;
  round.wasFirstAttemptSuccess = false;
  state.totalScore += finalPoints;
  state.blitzTimedOut = true;
  state.blitzRemainingSeconds = 0;
  round.pendingModal = { type: "blitz_timeout", correctCount, finalPoints };

  sounds.miss();
  haptics.miss();
  saveState();
  openPersistedAttemptModal(round.pendingModal, registeredCallbacks);
}

function updateTimerDisplay(data) {
  const t = getT();
  const round = state.activeRound;
  const blitz = isBlitzRound(round);
  const timerWidget = document.getElementById("timerWidget");
  const digitsEl = document.getElementById("timerDigits");
  const hourglassEl = document.getElementById("timerHourglass");
  const fillEl = document.getElementById("timerBarFill");
  const btnToggle = document.getElementById("btnTimerToggle");
  const bannerEl = document.getElementById("timerExpiredBanner");

  if (!timerWidget || !digitsEl) return;

  digitsEl.textContent = data.formattedTime;

  if (fillEl) {
    fillEl.style.width = `${Math.max(0, Math.min(100, data.percentage))}%`;
    fillEl.classList.toggle("warning", data.percentage <= 40 && data.percentage > 15);
    fillEl.classList.toggle("critical", data.percentage <= 15);
  }

  timerWidget.classList.toggle("warning", data.percentage <= 40 && data.percentage > 15);
  timerWidget.classList.toggle("critical", data.percentage <= 15 && data.remainingSeconds > 0);

  if (hourglassEl) {
    hourglassEl.classList.toggle("running", data.isRunning && !blitz);
  }

  if (btnToggle) {
    btnToggle.textContent = data.isRunning ? "⏸️" : "▶️";
    btnToggle.title = data.isRunning ? t.timerPaused : t.timerRunning;
  }

  if (bannerEl) {
    bannerEl.classList.toggle("active", data.isExpired && !blitz);
  }

  if (round && state.screen === "screenTeamGuessing") {
    if (blitz) {
      if (!state.blitzTimedOut) {
        state.blitzRemainingSeconds = Math.max(0, data.remainingSeconds);
        state.blitzTotalSeconds = Math.max(state.blitzTotalSeconds || state.blitzDuration, data.totalSeconds);
      }
      round.timerPaused = !data.isRunning && !data.isExpired && data.remainingSeconds > 0;
      if (data.remainingSeconds % 3 === 0 || !data.isRunning || data.isExpired) {
        saveState();
      }
      if (data.isExpired && !round.pendingModal && !state.blitzTimedOut) {
        handleBlitzTimeExpired();
      }
    } else {
      round.timerRemaining = data.remainingSeconds;
      round.timerTotalSeconds = data.totalSeconds;
      round.timerPaused = !data.isRunning && !data.isExpired && data.remainingSeconds > 0;
      if (data.remainingSeconds % 3 === 0 || !data.isRunning || data.isExpired) {
        saveState();
      }
    }
  }
}

function executeSingleCardTap({ cardId, inTray, slotIndex }) {
  const round = state.activeRound;
  if (!round) return;

  if (!inTray && slotIndex !== null && !Number.isNaN(slotIndex)) {
    const item = round.teamBoard[slotIndex];
    if (item && item.card.id === cardId && !item.isLocked) {
      sounds.place();
      haptics.place();
      if (round.selectedTrayCardId) {
        const trayIdx = round.trayCards.findIndex((tc) => tc.card.id === round.selectedTrayCardId);
        if (trayIdx !== -1) {
          const [selectedTrayCard] = round.trayCards.splice(trayIdx, 1);
          round.trayCards.push({ card: item.card, rotation: item.rotation });
          round.teamBoard[slotIndex] = {
            card: selectedTrayCard.card,
            rotation: selectedTrayCard.rotation,
            isLocked: false
          };
          round.selectedTrayCardId = null;
          saveState();
          renderTeamGuessingScreen();
          return;
        }
      }
      round.trayCards.push({ card: item.card, rotation: item.rotation });
      round.teamBoard[slotIndex] = null;
      round.selectedTrayCardId = null;
      saveState();
      renderTeamGuessingScreen();
    }
    return;
  }

  if (inTray) {
    const existsInTray = round.trayCards.some((tc) => tc.card.id === cardId);
    if (!existsInTray) return;

    sounds.tap();
    haptics.tap();

    if (round.selectedTrayCardId === cardId) {
      round.selectedTrayCardId = null;
    } else {
      round.selectedTrayCardId = cardId;
    }
    saveState();
    renderTeamGuessingScreen();
  }
}

/**
 * Handles pointer tap on any unlocked .game-card (called by dragDrop.js on tap).
 * Supports double-tap to rotate clockwise by 90 degrees while keeping single-tap responsive.
 */
export function handleTeamCardPointerTap(cardEl, cardId) {
  const round = state.activeRound;
  if (!round || !cardEl || !cardId) return;

  const inTray = cardEl.getAttribute("data-in-tray") === "true";
  const slotIdxStr = cardEl.getAttribute("data-slot-index");
  const slotIndex = slotIdxStr !== null ? parseInt(slotIdxStr, 10) : null;

  // Second tap on same card within window -> instant 90° rotation!
  if (pendingCardTap && pendingCardTap.cardId === cardId) {
    cancelPendingCardTap();
    rotateCard(cardId);
    return;
  }

  // If another card had a pending single tap, flush it right away
  if (pendingCardTap) {
    const prevAction = pendingCardTap.payload;
    cancelPendingCardTap();
    executeSingleCardTap(prevAction);
  }

  const payload = { cardId, inTray, slotIndex };
  const timerId = setTimeout(() => {
    pendingCardTap = null;
    executeSingleCardTap(payload);
  }, DOUBLE_TAP_WINDOW_MS);

  pendingCardTap = { cardId, timerId, payload };
}

/**
 * Handles clicks on non-draggable board controls (rotate button & empty slots).
 * Draggable .game-card taps are handled directly by handleTeamCardPointerTap.
 */
export function handleSlotOrCardTap(target) {
  const round = state.activeRound;
  if (!round || !target) return;

  // 1. Rotation button click (instant, 0ms delay)
  const rotateBtn = target.closest('[data-action="rotate"]');
  if (rotateBtn) {
    cancelPendingCardTap();
    const cardId = rotateBtn.getAttribute("data-card-id");
    if (cardId) rotateCard(cardId);
    return;
  }

  // 2. Empty slot click on board
  const emptySlotEl = target.closest('[data-action="empty-slot"]');
  if (emptySlotEl) {
    if (pendingCardTap) {
      const prevAction = pendingCardTap.payload;
      cancelPendingCardTap();
      executeSingleCardTap(prevAction);
    }
    const slotIdx = parseInt(emptySlotEl.getAttribute("data-slot-index"), 10);
    placeCardIntoSlot(slotIdx);
  }
}

export function rotateCard(cardId) {
  const round = state.activeRound;
  if (!round) return;

  sounds.rotate();
  haptics.rotate();

  let found = false;
  for (let i = 0; i < 4; i++) {
    const item = round.teamBoard[i];
    if (item && item.card.id === cardId && !item.isLocked) {
      item.rotation = (item.rotation + 1) % 4;
      found = true;
      break;
    }
  }

  if (!found) {
    const trayItem = round.trayCards.find((tc) => tc.card.id === cardId);
    if (trayItem) {
      trayItem.rotation = (trayItem.rotation + 1) % 4;
    }
  }

  lastRotatedTeamCardId = cardId;
  saveState();
  renderTeamGuessingScreen();
}

export function shuffleTrayCards() {
  const round = state.activeRound;
  if (!round || round.trayCards.length <= 1) return;

  cancelPendingCardTap();
  sounds.tap();
  haptics.tap();

  // Ensure order visibly changes when shuffling 2+ cards
  const prevOrder = round.trayCards.map((tc) => tc.card.id).join(",");
  let nextCards = shuffle(round.trayCards);
  if (nextCards.map((tc) => tc.card.id).join(",") === prevOrder && nextCards.length >= 2) {
    nextCards = [...nextCards.slice(1), nextCards[0]];
  }

  round.trayCards = nextCards;
  justShuffledTray = true;
  saveState();
  renderTeamGuessingScreen();
}

export function placeCardIntoSlot(slotIndex) {
  const round = state.activeRound;
  if (!round || !round.selectedTrayCardId) return;

  const trayIndex = round.trayCards.findIndex((tc) => tc.card.id === round.selectedTrayCardId);
  if (trayIndex === -1) return;

  sounds.place();
  haptics.place();
  const [removed] = round.trayCards.splice(trayIndex, 1);
  round.teamBoard[slotIndex] = {
    card: removed.card,
    rotation: removed.rotation,
    isLocked: false
  };
  round.selectedTrayCardId = null;

  saveState();
  renderTeamGuessingScreen();
}

export function resetBoardToTray() {
  const round = state.activeRound;
  if (!round) return;

  cancelPendingCardTap();
  sounds.tap();
  haptics.tap();
  for (let i = 0; i < 4; i++) {
    const item = round.teamBoard[i];
    if (item && !item.isLocked) {
      round.trayCards.push({ card: item.card, rotation: item.rotation });
      round.teamBoard[i] = null;
    }
  }
  round.selectedTrayCardId = null;

  saveState();
  renderTeamGuessingScreen();
}

function openPersistedAttemptModal(modalState, callbacks = {}) {
  const merged = { ...registeredCallbacks, ...callbacks };
  const { showAttemptModal, onFinished, onBlitzGameOver } = merged;
  const round = state.activeRound;
  const t = getT();
  if (!round || !modalState || typeof showAttemptModal !== "function") return;

  if (modalState.type === "attempt1_success") {
    showAttemptModal({
      icon: "🌟",
      title: t.attemptModalTitleSuccess,
      desc: t.attemptModalDescSuccess,
      onContinue: () => {
        round.pendingModal = null;
        saveState();
        if (typeof onFinished === "function") onFinished();
      }
    });
  } else if (modalState.type === "attempt1_success_hard") {
    const pts = modalState.finalPoints || 7;
    const bonus = modalState.hardBonus || Math.max(1, pts - 6);
    const traps = modalState.distractorCount || bonus + 1;
    showAttemptModal({
      icon: "🔥",
      title: t.attemptModalTitleSuccessHard(pts),
      desc: t.attemptModalDescSuccessHard(bonus, traps),
      onContinue: () => {
        round.pendingModal = null;
        saveState();
        if (typeof onFinished === "function") onFinished();
      }
    });
  } else if (modalState.type === "attempt1_success_blitz") {
    showAttemptModal({
      icon: "⚡",
      title: t.attemptModalTitleSuccessBlitz,
      desc: t.attemptModalDescSuccessBlitz,
      onContinue: () => {
        round.pendingModal = null;
        saveState();
        if (typeof onFinished === "function") onFinished();
      }
    });
  } else if (modalState.type === "attempt1_miss") {
    showAttemptModal({
      icon: "⚠️",
      title: t.attemptModalTitleMiss(modalState.correctCount),
      desc: t.attemptModalDescMiss,
      onContinue: () => {
        round.pendingModal = null;
        round.timerPaused = false;
        if (isBlitzRound(round)) {
          saveState();
          const rem = typeof state.blitzRemainingSeconds === "number" ? state.blitzRemainingSeconds : 0;
          if (rem > 0) {
            const total = Math.max(state.blitzTotalSeconds || state.blitzDuration, rem);
            sandTimer.init(total);
            sandTimer.remainingSeconds = rem;
            sandTimer.resume();
          } else {
            handleBlitzTimeExpired();
            return;
          }
        } else {
          round.timerRemaining = null;
          round.timerTotalSeconds = null;
          saveState();
          if (state.timerSetting > 0) {
            sandTimer.start(state.timerSetting);
          }
        }
        renderTeamGuessingScreen();
      }
    });
  } else if (modalState.type === "attempt2_final") {
    const pts = modalState.finalPoints;
    const lostLife = Boolean(modalState.lostLife);
    const livesLeft = typeof modalState.livesLeft === "number" ? modalState.livesLeft : state.marathonLives;
    showAttemptModal({
      icon: lostLife ? (livesLeft > 0 ? "💔" : "💀") : pts >= 3 ? "🎉" : "📋",
      title: t.attemptModalTitleFinal(pts),
      desc: lostLife ? t.attemptModalDescMarathonLoss(livesLeft) : t.attemptModalDescFinal,
      onContinue: () => {
        round.pendingModal = null;
        saveState();
        if (typeof onFinished === "function") onFinished();
      }
    });
  } else if (modalState.type === "blitz_timeout") {
    const pts = modalState.finalPoints || 0;
    showAttemptModal({
      icon: "⏰",
      title: t.blitzTimeUpModalTitle,
      desc: t.blitzTimeUpModalDesc(pts),
      onContinue: () => {
        round.pendingModal = null;
        saveState();
        if (typeof onBlitzGameOver === "function") {
          onBlitzGameOver();
        } else if (typeof onFinished === "function") {
          onFinished();
        }
      }
    });
  }
}

export function restorePendingAttemptModal(callbacks = {}) {
  setTeamScreenCallbacks(callbacks);
  const round = state.activeRound;
  if (state.screen === "screenTeamGuessing" && round && round.pendingModal) {
    openPersistedAttemptModal(round.pendingModal, callbacks);
  }
}

export function checkTeamSolution(callbacks = {}) {
  setTeamScreenCallbacks(callbacks);
  const round = state.activeRound;
  if (!round) return;

  // Prevent double evaluation if a result modal is already pending
  if (round.pendingModal) {
    openPersistedAttemptModal(round.pendingModal, callbacks);
    return;
  }

  cancelPendingCardTap();

  if (round.teamBoard.some((s) => !s || !s.card)) return;

  // Snapshot remaining Blitz seconds before stopping the clock
  if (isBlitzRound(round) && !state.blitzTimedOut) {
    state.blitzRemainingSeconds = Math.max(0, sandTimer.remainingSeconds);
  }

  // Compare each slot
  let correctCount = 0;
  const matches = [false, false, false, false];

  for (let i = 0; i < 4; i++) {
    const teamSlot = round.teamBoard[i];
    const secretSlot = round.secretBoard[i];

    if (teamSlot.card.id === secretSlot.card.id && teamSlot.rotation === secretSlot.rotation) {
      correctCount++;
      matches[i] = true;
    }
  }

  sandTimer.stop();

  if (round.attempt === 1) {
    if (correctCount === 4) {
      sounds.success();
      haptics.success();
      round.wasFirstAttemptSuccess = true;

      if (round.gameMode === "hard") {
        // Hard Mode Attempt 1 mastery: 6 + (distractorCount - 1) difficulty bonus
        const traps = Array.isArray(round.fakeCards)
          ? round.fakeCards.length
          : typeof round.distractorCount === "number"
            ? round.distractorCount
            : 2;
        const hardBonus = Math.max(1, traps - 1);
        const hardPoints = 6 + hardBonus;
        round.hardBonus = hardBonus;
        round.lastRoundPoints = hardPoints;
        state.totalScore += hardPoints;
        round.pendingModal = {
          type: "attempt1_success_hard",
          correctCount: 4,
          finalPoints: hardPoints,
          hardBonus,
          distractorCount: traps
        };
      } else if (round.gameMode === "blitz") {
        // Match Blitz Attempt 1 mastery: 6 points + 30s added to shared bank
        round.lastRoundPoints = 6;
        state.totalScore += 6;
        const baseRem = typeof state.blitzRemainingSeconds === "number" ? state.blitzRemainingSeconds : 0;
        state.blitzRemainingSeconds = baseRem + 30;
        state.blitzTotalSeconds = Math.max(state.blitzTotalSeconds || state.blitzDuration, state.blitzRemainingSeconds);
        round.blitzBonusAdded = 30;
        round.pendingModal = { type: "attempt1_success_blitz", correctCount: 4, finalPoints: 6 };
      } else {
        // Classic & Marathon: 6 points
        round.lastRoundPoints = 6;
        state.totalScore += 6;
        round.pendingModal = { type: "attempt1_success", correctCount: 4, finalPoints: 6 };
      }

      saveState();
      openPersistedAttemptModal(round.pendingModal, callbacks);
    } else {
      // Partial on attempt 1: lock correct, return incorrect to tray
      sounds.miss();
      haptics.miss();
      for (let i = 0; i < 4; i++) {
        if (matches[i]) {
          round.teamBoard[i].isLocked = true;
        } else {
          round.trayCards.push({
            card: round.teamBoard[i].card,
            rotation: round.teamBoard[i].rotation
          });
          round.teamBoard[i] = null;
        }
      }
      round.attempt = 2;
      round.selectedTrayCardId = null;
      if (!isBlitzRound(round)) {
        round.timerRemaining = null;
        round.timerTotalSeconds = null;
      }
      round.timerPaused = false;
      round.pendingModal = { type: "attempt1_miss", correctCount };
      saveState();
      openPersistedAttemptModal(round.pendingModal, callbacks);
    }
  } else {
    // Attempt 2 final evaluation
    const finalPoints = correctCount; // 1 point per correct card
    round.lastRoundPoints = finalPoints;
    round.wasFirstAttemptSuccess = false;
    state.totalScore += finalPoints;

    let lostLife = false;
    if (round.gameMode === "marathon" && finalPoints < 3) {
      state.marathonLives = Math.max(0, state.marathonLives - 1);
      round.lostLife = true;
      lostLife = true;
    } else {
      round.lostLife = false;
    }

    if (finalPoints >= 3) {
      sounds.success();
      haptics.success();
    } else {
      sounds.miss();
      haptics.miss();
    }

    round.pendingModal = {
      type: "attempt2_final",
      correctCount,
      finalPoints,
      lostLife,
      livesLeft: state.marathonLives
    };
    saveState();
    openPersistedAttemptModal(round.pendingModal, callbacks);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
