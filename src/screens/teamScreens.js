/**
 * Team Screens Controller
 * Handles team handoff, team guessing, sand timer integration, card tray, and solution evaluation.
 */
import { state, saveState, getT } from "../state.js";
import { renderCloverBoard } from "../components/boardRenderer.js";
import { renderCardHtml } from "../components/cardRenderer.js";
import { sounds } from "../audio.js";
import { sandTimer } from "../timer.js";

let timerUnsubscribe = null;

export function renderTeamHandoffScreen() {
  // Static notice screen
}

export function startTeamGuessingPhase() {
  // Reset and start sand timer if configured
  if (state.timerSetting && state.timerSetting > 0) {
    sandTimer.start(state.timerSetting);
  } else {
    sandTimer.stop();
  }
}

export function stopTeamGuessingPhase() {
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

  setText("txtGuessingLeaderName", round.leaderName);
  setText("badgeAttemptNum", round.attempt === 1 ? t.attempt1of2 : t.attempt2of2);

  // Setup Sand Timer Subscription if timer is active
  setupTimerUI();

  // Render clover board for team
  const boardEl = document.getElementById("boardContainerTeam");
  renderCloverBoard(
    boardEl,
    {
      slots: round.teamBoard,
      clues: round.clues,
      showWordPreviews: false,
      canInteract: true,
      isLeaderMode: false
    },
    state
  );

  // Render card tray
  const trayEl = document.getElementById("trayCardsContainer");
  if (trayEl) {
    if (round.trayCards.length === 0) {
      trayEl.innerHTML = `<div style="font-size: 11px; color: #94a3b8; padding: 16px; width: 100%; text-align: center;">Все карты размещены на клевере</div>`;
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
              isDraggable: true
            },
            state.lang
          )
        )
        .join("");
    }
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

  if (!state.timerSetting || state.timerSetting <= 0) {
    timerWidget.style.display = "none";
    return;
  }

  timerWidget.style.display = "flex";

  if (!timerUnsubscribe) {
    timerUnsubscribe = sandTimer.subscribe((data) => {
      updateTimerDisplay(data);
    });
  }
}

function updateTimerDisplay(data) {
  const t = getT();
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
    hourglassEl.classList.toggle("running", data.isRunning);
  }

  if (btnToggle) {
    btnToggle.textContent = data.isRunning ? "⏸️" : "▶️";
    btnToggle.title = data.isRunning ? t.timerPaused : t.timerRunning;
  }

  if (bannerEl) {
    bannerEl.classList.toggle("active", data.isExpired);
  }
}

export function handleSlotOrCardTap(target) {
  const round = state.activeRound;
  if (!round) return;

  // 1. Rotation button click
  const rotateBtn = target.closest('[data-action="rotate"]');
  if (rotateBtn) {
    const cardId = rotateBtn.getAttribute("data-card-id");
    if (cardId) rotateCard(cardId);
    return;
  }

  // 2. Empty slot click on board
  const emptySlotEl = target.closest('[data-action="empty-slot"]');
  if (emptySlotEl) {
    const slotIdx = parseInt(emptySlotEl.getAttribute("data-slot-index"), 10);
    placeCardIntoSlot(slotIdx);
    return;
  }

  // 3. Card click inside board
  const boardCardEl = target.closest('.clover-grid-2x2 .game-card');
  if (boardCardEl) {
    const slotIdx = parseInt(boardCardEl.getAttribute("data-slot-index"), 10);
    const item = round.teamBoard[slotIdx];
    if (item && !item.isLocked) {
      // Pick card back up to tray
      sounds.place();
      round.trayCards.push({ card: item.card, rotation: item.rotation });
      round.teamBoard[slotIdx] = null;
      round.selectedTrayCardId = null;
      saveState();
      renderTeamGuessingScreen();
    }
    return;
  }

  // 4. Card click in tray
  const trayCardEl = target.closest('.tray-cards-row .game-card');
  if (trayCardEl) {
    const cardId = trayCardEl.getAttribute("data-card-id");
    sounds.tap();

    if (round.selectedTrayCardId === cardId) {
      round.selectedTrayCardId = null;
    } else {
      round.selectedTrayCardId = cardId;
      // Auto-place if exactly one slot is empty
      const emptyIndices = [];
      for (let i = 0; i < 4; i++) {
        if (!round.teamBoard[i]) emptyIndices.push(i);
      }
      if (emptyIndices.length === 1) {
        placeCardIntoSlot(emptyIndices[0]);
        return;
      }
    }
    saveState();
    renderTeamGuessingScreen();
  }
}

export function rotateCard(cardId) {
  const round = state.activeRound;
  if (!round) return;

  sounds.rotate();

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

  saveState();
  renderTeamGuessingScreen();
}

export function placeCardIntoSlot(slotIndex) {
  const round = state.activeRound;
  if (!round) return;

  let trayIndex = -1;
  if (round.selectedTrayCardId) {
    trayIndex = round.trayCards.findIndex((tc) => tc.card.id === round.selectedTrayCardId);
  } else if (round.trayCards.length > 0) {
    trayIndex = 0;
  }

  if (trayIndex === -1) return;

  sounds.place();
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

  sounds.tap();
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

export function checkTeamSolution(callbacks = {}) {
  const { showAttemptModal, onFinished } = callbacks;
  const round = state.activeRound;
  const t = getT();
  if (!round) return;

  if (round.teamBoard.some((s) => !s || !s.card)) return;

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
      // 1st attempt full success: 6 points
      sounds.success();
      round.lastRoundPoints = 6;
      round.wasFirstAttemptSuccess = true;
      state.totalScore += 6;

      showAttemptModal({
        icon: "🌟",
        title: t.attemptModalTitleSuccess,
        desc: t.attemptModalDescSuccess,
        onContinue: () => {
          saveState();
          if (typeof onFinished === "function") onFinished();
        }
      });
    } else {
      // Partial on attempt 1: lock correct, return incorrect to tray
      sounds.miss();
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

      showAttemptModal({
        icon: "⚠️",
        title: t.attemptModalTitleMiss(correctCount),
        desc: t.attemptModalDescMiss,
        onContinue: () => {
          saveState();
          // Resume timer if active
          if (state.timerSetting > 0) {
            sandTimer.start(state.timerSetting);
          }
          renderTeamGuessingScreen();
        }
      });
    }
  } else {
    // Attempt 2 final evaluation
    const finalPoints = correctCount; // 1 point per correct card
    round.lastRoundPoints = finalPoints;
    round.wasFirstAttemptSuccess = false;
    state.totalScore += finalPoints;

    if (finalPoints >= 3) {
      sounds.success();
    } else {
      sounds.miss();
    }

    showAttemptModal({
      icon: finalPoints >= 3 ? "🎉" : "📋",
      title: t.attemptModalTitleFinal(finalPoints),
      desc: t.attemptModalDescFinal,
      onContinue: () => {
        saveState();
        if (typeof onFinished === "function") onFinished();
      }
    });
  }

  saveState();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
