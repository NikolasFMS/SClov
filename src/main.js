/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Удачные слова (So Clover!)
 * Travel board game web application.
 * Native HTML5, CSS and Vanilla JavaScript (Zero external dependencies).
 * Modular architecture: Audio, Decks, State, Timer, Drag & Drop, Screen Renderers.
 */

import { sounds } from "./audio.js";
import { state, saveState, getT } from "./state.js";
import { AVAILABLE_DECKS, getSelectedDecks } from "./decks.js";
import { generateRoundCards } from "./gameLogic.js";
import { sandTimer } from "./timer.js";
import { initDragAndDrop } from "./dragDrop.js";

// Screen Controllers
import { renderSetupScreen } from "./screens/setupScreen.js";
import {
  renderLeaderIntroScreen,
  renderLeaderWritingScreen,
  validateLeaderInputs,
  rerollLeaderCards,
  rotateLeaderCard,
  finishLeaderWriting
} from "./screens/leaderScreens.js";
import {
  renderTeamHandoffScreen,
  renderTeamGuessingScreen,
  startTeamGuessingPhase,
  stopTeamGuessingPhase,
  handleSlotOrCardTap,
  resetBoardToTray,
  checkTeamSolution,
  rotateCard
} from "./screens/teamScreens.js";
import {
  renderSummaryScreen,
  renderGameOverScreen,
  renderRulesContent,
  handleNextRoundOrFinish
} from "./screens/summaryScreen.js";

// ============================================================================
// 1. SCREEN SWITCHER & ROUTER
// ============================================================================
export function switchScreen(screenId) {
  // If leaving team guessing, stop the sand timer
  if (state.screen === "screenTeamGuessing" && screenId !== "screenTeamGuessing") {
    stopTeamGuessingPhase();
  }

  state.screen = screenId;
  saveState();

  document.querySelectorAll(".screen-section").forEach((sec) => {
    sec.classList.remove("active");
  });

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // If entering team guessing, start the sand timer
  if (screenId === "screenTeamGuessing") {
    startTeamGuessingPhase();
  }

  renderCurrentScreen();
}

export function renderCurrentScreen() {
  const s = state.screen;
  if (s === "screenSetup") {
    renderSetupScreen();
  } else if (s === "screenLeaderIntro") {
    renderLeaderIntroScreen();
  } else if (s === "screenLeaderWriting") {
    renderLeaderWritingScreen();
  } else if (s === "screenTeamHandoff") {
    renderTeamHandoffScreen();
  } else if (s === "screenTeamGuessing") {
    renderTeamGuessingScreen();
  } else if (s === "screenSummary") {
    renderSummaryScreen();
  } else if (s === "screenGameOver") {
    renderGameOverScreen();
  }
}

// ============================================================================
// 2. MATCH & ROUND MANAGEMENT
// ============================================================================
export function startNewMatch() {
  const t = getT();
  if (state.players.length < 2) {
    alert(t.alertMinPlayers);
    return;
  }

  sounds.init();
  sounds.tap();

  state.currentRoundIndex = 0;
  state.totalScore = 0;
  state.roundHistory = [];

  setupRound(0);
  switchScreen("screenLeaderIntro");
}

export function setupRound(roundIndex) {
  state.currentRoundIndex = roundIndex;
  const totalRounds = state.players.length * state.roundsPerPlayer;
  const leaderName = state.players[roundIndex % state.players.length];
  const selectedDecks = getSelectedDecks(state);
  const deckNames = selectedDecks
    .map((d) => (typeof d.name === "object" ? d.name[state.lang] || d.name.ru || d.id : d.name || d.id))
    .join(" + ");

  const { cloverCards, fakeCard } = generateRoundCards(state);

  // Initialize secret board with 4 cards and random rotations
  const secretBoard = cloverCards.map((card) => ({
    card,
    rotation: Math.floor(Math.random() * 4)
  }));

  state.activeRound = {
    roundNum: roundIndex + 1,
    totalRounds,
    leaderName,
    deckId: state.selectedDeckIds.join(","),
    deckName: deckNames,
    deckMode: state.deckMode,
    secretBoard,
    fakeCard,
    clues: { north: "", east: "", south: "", west: "" },
    attempt: 1,
    teamBoard: [null, null, null, null],
    trayCards: [],
    selectedTrayCardId: null,
    lastRoundPoints: 0,
    wasFirstAttemptSuccess: false,
    summaryViewMode: "secret"
  };

  saveState();
}

// ============================================================================
// 3. ATTEMPT MODAL
// ============================================================================
export function showAttemptModal({ icon, title, desc, onContinue }) {
  const modal = document.getElementById("modalAttemptResult");
  setText("iconAttemptModal", icon);
  setText("titleAttemptModal", title);
  setText("descAttemptModal", desc);

  const btnCont = document.getElementById("btnContinueAttempt");
  if (btnCont) {
    btnCont.onclick = () => {
      modal.classList.remove("active");
      if (typeof onContinue === "function") onContinue();
    };
  }

  if (modal) modal.classList.add("active");
}

// ============================================================================
// 4. LANGUAGE UI UPDATES
// ============================================================================
export function updateLanguageUI() {
  const t = getT();

  // Top header
  setText("lblCurrentLang", state.lang.toUpperCase());
  setText("txtHeaderSubtitle", t.subtitle);
  setText("txtScoreLabel", t.scoreLabel);
  setText("txtScoreValue", state.totalScore);
  setText("txtInstallBtn", t.installBtn);

  // Setup screen
  setText("txtHeroPill", t.heroPill);
  setText("txtHeroTitle", t.heroTitle);
  setText("txtHeroDesc", t.heroDesc);
  setText("txtDeckSelectHeader", t.deckSelectHeader);
  setText("txtDeckModeHeader", t.deckModeHeader);
  setText("txtModePredefinedTitle", t.modePredefinedTitle);
  setText("txtModePredefinedDesc", t.modePredefinedDesc);
  setText("txtPredefinedDisabled", t.txtPredefinedDisabled);
  setText("txtModeRandomTitle", t.modeRandomTitle);
  setText("txtModeRandomDesc", t.modeRandomDesc);
  setText("txtDeckNoticeOnlyRandom", t.txtDeckNoticeOnlyRandom);
  setText("txtTimerSelectHeader", t.timerHeader);
  setText("btnTimer0", t.timerOptOff);
  setText("btnTimer60", t.timerOpt1m);
  setText("btnTimer120", t.timerOpt2m);
  setText("btnTimer180", t.timerOpt3m);
  setText("btnTimer300", t.timerOpt5m);
  setText("txtPlayersHeader", t.playersHeader);
  setText("txtNoLimit", t.noLimit);
  setText("btnAddPlayer", t.btnAddPlayer);
  setText("txtCloversPerPlayer", t.cloversPerPlayer);
  setText("txtStartGameBtn", t.btnStartGame);

  const inputNewPlayer = document.getElementById("inputNewPlayer");
  if (inputNewPlayer) inputNewPlayer.placeholder = t.inputPlayerPlaceholder;

  // Leader intro screen
  setText("txtLeaderAttention", t.leaderAttention);
  setText("txtOpenMyClover", t.btnOpenMyClover);
  setText("txtLeaderPassTitle", t.passPhoneToLeader);

  // Leader writing screen
  setText("txtLeaderLabel", t.leaderLabel);
  setText("txtCluesCountLabel", t.cluesCountLabel);
  setText("txtRecord4CluesTitle", t.record4CluesTitle);
  setText("lblNorth", t.lblNorth);
  setText("lblEast", t.lblEast);
  setText("lblSouth", t.lblSouth);
  setText("lblWest", t.lblWest);
  setText("txtRerollBtn", t.btnReroll);

  ["inputClueNorth", "inputClueEast", "inputClueSouth", "inputClueWest"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = t.clueInputPlaceholder;
  });

  // Team handoff screen
  setText("txtTeamTurnTitle", t.teamTurnTitle);
  setText("txtTeamPassDesc", t.teamPassDesc);
  setText("txtLeaderSilentNotice", t.leaderSilentNotice);
  setText("txtTeamReadyBtn", t.btnStartTeamGuessing);

  // Team guessing screen
  setText("txtCloverOfLabel", t.cloverOfLabel);
  setText("txtTrayTitle", t.trayTitle);
  setText("txtTrayHint", t.trayHintDrag);
  setText("txtResetTrayBtn", t.btnResetTray);
  setText("btnTimerAdd30", t.timerAdd30s);
  setText("txtTimerExpiredNotice", t.timerTimesUpDesc);

  // Summary screen
  setText("txtSumLeaderLabel", t.sumLeaderLabel);
  setText("txtSumRoundPtsLabel", t.sumRoundPtsLabel);
  setText("txtSumTotalLabel", t.sumTotalLabel);
  setText("txtOriginalLeader", t.btnOriginalLeader);
  setText("txtTeamGuess", t.btnTeamGuess);
  setText("txtFakeCardLabel", t.fakeCardLabel);
  setText("txtFakeCardDesc", t.fakeCardDesc);

  // Game over screen
  setText("txtGameOverTitle", t.gameOverTitle);
  setText("txtFinalPointsWord", t.pointsWord);
  setText("txtChronologyTitle", t.chronologyTitle);
  setText("txtPlayAgainBtn", t.btnPlayAgain);

  // Modals
  setText("txtConfirmResetTitle", t.confirmResetTitle);
  setText("txtConfirmResetBody", t.confirmResetBody);
  setText("btnCancelReset", t.btnCancel);
  setText("btnExecuteReset", t.btnConfirmReset);
  setText("txtRulesModalTitle", t.rulesTitle);
  setText("btnAckRules", t.btnUnderstood);
  setText("txtContinueAttemptBtn", t.btnContinue);

  // Footer
  setText("txtFooterCopyright", t.footerCopyright);

  // Render rules modal body content
  renderRulesContent();

  // Re-render current active screen content
  renderCurrentScreen();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ============================================================================
// 5. EVENT LISTENERS
// ============================================================================
export function setupEventListeners() {
  // 1. Header Logo click -> opens confirmation modal
  const btnLogo = document.getElementById("btnHeaderLogo");
  if (btnLogo) {
    btnLogo.addEventListener("click", () => {
      sounds.tap();
      const modal = document.getElementById("modalConfirmReset");
      if (modal) modal.classList.add("active");
    });
  }

  // Reset modal buttons
  const btnCloseReset = document.getElementById("btnCloseConfirmReset");
  const btnCancelReset = document.getElementById("btnCancelReset");
  const btnExecReset = document.getElementById("btnExecuteReset");

  const closeResetModal = () => {
    sounds.tap();
    const modal = document.getElementById("modalConfirmReset");
    if (modal) modal.classList.remove("active");
  };

  if (btnCloseReset) btnCloseReset.addEventListener("click", closeResetModal);
  if (btnCancelReset) btnCancelReset.addEventListener("click", closeResetModal);

  if (btnExecReset) {
    btnExecReset.addEventListener("click", () => {
      sounds.tap();
      closeResetModal();
      stopTeamGuessingPhase();
      state.screen = "screenSetup";
      state.currentRoundIndex = 0;
      state.totalScore = 0;
      state.roundHistory = [];
      state.activeRound = null;
      saveState();
      switchScreen("screenSetup");
    });
  }

  // 2. Language Switcher (RU ⇄ EN)
  const btnToggleLang = document.getElementById("btnToggleLang");
  if (btnToggleLang) {
    btnToggleLang.addEventListener("click", () => {
      sounds.tap();
      state.lang = state.lang === "ru" ? "en" : "ru";
      saveState();
      updateLanguageUI();
    });
  }

  // 3. Rules Modal
  const btnOpenRules = document.getElementById("btnOpenRules");
  const btnCloseRules = document.getElementById("btnCloseRules");
  const btnAckRules = document.getElementById("btnAckRules");

  if (btnOpenRules) {
    btnOpenRules.addEventListener("click", () => {
      sounds.tap();
      const modal = document.getElementById("modalRules");
      if (modal) modal.classList.add("active");
    });
  }

  const closeRulesModal = () => {
    sounds.tap();
    const modal = document.getElementById("modalRules");
    if (modal) modal.classList.remove("active");
  };

  if (btnCloseRules) btnCloseRules.addEventListener("click", closeRulesModal);
  if (btnAckRules) btnAckRules.addEventListener("click", closeRulesModal);

  // 4. Setup Screen: Multi-deck selection
  const decksContainer = document.getElementById("decksListContainer");
  if (decksContainer) {
    decksContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".deck-choice-card[data-deck-id]");
      if (card) {
        const deckId = card.getAttribute("data-deck-id");
        if (!Array.isArray(state.selectedDeckIds)) {
          state.selectedDeckIds = ["original"];
        }
        const isCurrentlySelected = state.selectedDeckIds.includes(deckId);
        if (isCurrentlySelected) {
          if (state.selectedDeckIds.length > 1) {
            sounds.tap();
            state.selectedDeckIds = state.selectedDeckIds.filter((id) => id !== deckId);
          }
        } else {
          sounds.tap();
          state.selectedDeckIds.push(deckId);
        }

        const selected = getSelectedDecks(state);
        const hasAnyCardDeck = selected.some((d) => d.hasPredefinedCards);
        if (!hasAnyCardDeck) {
          state.deckMode = "random";
        }

        saveState();
        renderSetupScreen();
      }
    });
  }

  // Deck mode buttons
  const btnModePred = document.getElementById("btnModePredefined");
  const btnModeRnd = document.getElementById("btnModeRandom");

  if (btnModePred) {
    btnModePred.addEventListener("click", () => {
      const selected = getSelectedDecks(state);
      const hasAnyCardDeck = selected.some((d) => d.hasPredefinedCards);
      if (!hasAnyCardDeck) return;
      sounds.tap();
      state.deckMode = "predefined";
      saveState();
      renderSetupScreen();
    });
  }

  if (btnModeRnd) {
    btnModeRnd.addEventListener("click", () => {
      sounds.tap();
      state.deckMode = "random";
      saveState();
      renderSetupScreen();
    });
  }

  // Timer options in setup screen
  document.querySelectorAll(".btn-timer-opt[data-timer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sounds.tap();
      state.timerSetting = parseInt(btn.getAttribute("data-timer"), 10) || 0;
      saveState();
      renderSetupScreen();
    });
  });

  // Rounds per player
  document.querySelectorAll(".btn-round-opt[data-rounds]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sounds.tap();
      state.roundsPerPlayer = parseInt(btn.getAttribute("data-rounds"), 10) || 1;
      saveState();
      renderSetupScreen();
    });
  });

  // Add player form
  const formAddPlayer = document.getElementById("formAddPlayer");
  const inputNewPlayer = document.getElementById("inputNewPlayer");

  if (formAddPlayer) {
    formAddPlayer.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = inputNewPlayer ? inputNewPlayer.value.trim() : "";
      if (val) {
        sounds.tap();
        state.players.push(val);
        if (inputNewPlayer) inputNewPlayer.value = "";
        saveState();
        renderSetupScreen();
      }
    });
  }

  // Delete player
  const playersList = document.getElementById("playersListContainer");
  if (playersList) {
    playersList.addEventListener("click", (e) => {
      const btnDel = e.target.closest('[data-action="delete-player"]');
      if (btnDel) {
        const idx = parseInt(btnDel.getAttribute("data-idx"), 10);
        if (state.players.length > 2) {
          sounds.tap();
          state.players.splice(idx, 1);
          saveState();
          renderSetupScreen();
        }
      }
    });
  }

  // Start Match
  const btnStartGame = document.getElementById("btnStartGame");
  if (btnStartGame) {
    btnStartGame.addEventListener("click", startNewMatch);
  }

  // Leader Intro: Unlock Clover
  const btnUnlock = document.getElementById("btnUnlockLeader");
  if (btnUnlock) {
    btnUnlock.addEventListener("click", () => {
      sounds.tap();
      switchScreen("screenLeaderWriting");
    });
  }

  // Leader Writing: Inputs & Buttons
  ["inputClueNorth", "inputClueEast", "inputClueSouth", "inputClueWest"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", validateLeaderInputs);
    }
  });

  const btnReroll = document.getElementById("btnRerollLeaderCards");
  if (btnReroll) {
    btnReroll.addEventListener("click", rerollLeaderCards);
  }

  const btnFinishLeader = document.getElementById("btnFinishLeaderTurn");
  if (btnFinishLeader) {
    btnFinishLeader.addEventListener("click", () => {
      finishLeaderWriting(() => switchScreen("screenTeamHandoff"));
    });
  }

  // Leader card rotation
  const leaderScreen = document.getElementById("screenLeaderWriting");
  if (leaderScreen) {
    leaderScreen.addEventListener("click", (e) => {
      const rotateBtn = e.target.closest('[data-action="rotate"]');
      if (rotateBtn) {
        const cardId = rotateBtn.getAttribute("data-card-id");
        if (cardId) rotateLeaderCard(cardId);
      }
    });
  }

  // Team Handoff: Ready to guess
  const btnStartTeam = document.getElementById("btnStartTeamGuessing");
  if (btnStartTeam) {
    btnStartTeam.addEventListener("click", () => {
      sounds.tap();
      switchScreen("screenTeamGuessing");
    });
  }

  // Team Guessing: Tap handling on board and tray
  const teamScreen = document.getElementById("screenTeamGuessing");
  if (teamScreen) {
    teamScreen.addEventListener("click", (e) => {
      handleSlotOrCardTap(e.target);
    });
  }

  // Initialize unified Pointer/Touch Drag and Drop
  initDragAndDrop({
    getRound: () => state.activeRound,
    onStateChange: () => {
      saveState();
      renderTeamGuessingScreen();
    },
    onCardClick: (cardEl, cardId) => {
      handleSlotOrCardTap(cardEl);
    }
  });

  // Team Guessing: Sand timer controls
  const btnTimerToggle = document.getElementById("btnTimerToggle");
  if (btnTimerToggle) {
    btnTimerToggle.addEventListener("click", () => {
      sounds.tap();
      sandTimer.toggle();
    });
  }

  const btnTimerAdd30 = document.getElementById("btnTimerAdd30");
  if (btnTimerAdd30) {
    btnTimerAdd30.addEventListener("click", () => {
      sounds.tap();
      sandTimer.addSeconds(30);
    });
  }

  const btnDismissTimerBanner = document.getElementById("btnDismissTimerBanner");
  if (btnDismissTimerBanner) {
    btnDismissTimerBanner.addEventListener("click", () => {
      const banner = document.getElementById("timerExpiredBanner");
      if (banner) banner.classList.remove("active");
    });
  }

  const btnResetTray = document.getElementById("btnClearBoardToTray");
  if (btnResetTray) {
    btnResetTray.addEventListener("click", resetBoardToTray);
  }

  const btnCheckSol = document.getElementById("btnCheckSolution");
  if (btnCheckSol) {
    btnCheckSol.addEventListener("click", () => {
      checkTeamSolution({
        showAttemptModal,
        onFinished: () => switchScreen("screenSummary")
      });
    });
  }

  // Summary Screen: Toggle secret/team view
  const btnToggleSecret = document.getElementById("btnToggleSecretView");
  const btnToggleTeam = document.getElementById("btnToggleTeamView");

  if (btnToggleSecret) {
    btnToggleSecret.addEventListener("click", () => {
      sounds.tap();
      if (state.activeRound) {
        state.activeRound.summaryViewMode = "secret";
        renderSummaryScreen();
      }
    });
  }

  if (btnToggleTeam) {
    btnToggleTeam.addEventListener("click", () => {
      sounds.tap();
      if (state.activeRound) {
        state.activeRound.summaryViewMode = "team";
        renderSummaryScreen();
      }
    });
  }

  const btnNextRound = document.getElementById("btnNextRoundOrFinish");
  if (btnNextRound) {
    btnNextRound.addEventListener("click", () => {
      handleNextRoundOrFinish(
        (nextIdx) => {
          setupRound(nextIdx);
          switchScreen("screenLeaderIntro");
        },
        () => {
          switchScreen("screenGameOver");
        }
      );
    });
  }

  // Game Over: Play Again
  const btnPlayAgain = document.getElementById("btnPlayAgain");
  if (btnPlayAgain) {
    btnPlayAgain.addEventListener("click", () => {
      sounds.tap();
      state.screen = "screenSetup";
      state.currentRoundIndex = 0;
      state.totalScore = 0;
      state.roundHistory = [];
      state.activeRound = null;
      saveState();
      switchScreen("screenSetup");
    });
  }

  // PWA Install Prompt
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnPwa = document.getElementById("btnPwaInstall");
    if (btnPwa) {
      btnPwa.style.display = "flex";
      btnPwa.addEventListener("click", async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === "accepted") {
            btnPwa.style.display = "none";
          }
          deferredPrompt = null;
        }
      });
    }
  });
}

// ============================================================================
// 6. INITIALIZATION ON DOM READY
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  updateLanguageUI();

  const validScreens = [
    "screenSetup",
    "screenLeaderIntro",
    "screenLeaderWriting",
    "screenTeamHandoff",
    "screenTeamGuessing",
    "screenSummary",
    "screenGameOver"
  ];

  if (!validScreens.includes(state.screen) || (!state.activeRound && state.screen !== "screenSetup")) {
    state.screen = "screenSetup";
  }

  switchScreen(state.screen);
});
