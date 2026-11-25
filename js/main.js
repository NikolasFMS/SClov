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
import { haptics } from "./haptics.js";
import { state, saveState, syncSelectedDecksWithAvailable, getT, applyTheme } from "./state.js";
import { AVAILABLE_DECKS, getSelectedDecks, discoverExtraDecks } from "./decks.js";
import {
  generateRoundCards,
  resetSelectedDecksHistory,
  getEffectiveDistractorCount,
  MAX_DISTRACTOR_CARDS
} from "./gameLogic.js";
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
  handleLeaderCardTap,
  finishLeaderWriting
} from "./screens/leaderScreens.js";
import {
  renderTeamHandoffScreen,
  renderTeamGuessingScreen,
  startTeamGuessingPhase,
  stopTeamGuessingPhase,
  persistTimerSnapshot,
  setTeamScreenCallbacks,
  handleSlotOrCardTap,
  handleTeamCardPointerTap,
  cancelPendingCardTap,
  rotateCard,
  shuffleTrayCards,
  resetBoardToTray,
  checkTeamSolution,
  restorePendingAttemptModal
} from "./screens/teamScreens.js";
import {
  renderSummaryScreen,
  renderGameOverScreen,
  renderRulesContent,
  recordActiveRoundToHistory,
  handleNextRoundOrFinish
} from "./screens/summaryScreen.js";

// ============================================================================
// 1. SCREEN SWITCHER & ROUTER
// ============================================================================
let isReinstallingApp = false;

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

  // Update header score badge
  const scoreBadge = document.getElementById("scoreBadge");
  if (scoreBadge) {
    scoreBadge.classList.toggle("active", s !== "screenSetup");
  }
  setText("txtScoreValue", state.totalScore);

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
    showRestoreToast(t.alertMinPlayers);
    return;
  }

  sounds.init();
  sounds.tap();
  haptics.tap();

  state.currentRoundIndex = 0;
  state.totalScore = 0;
  state.roundHistory = [];
  state.matchUsedWords = [];
  state.blitzTimedOut = false;
  state.marathonLives = state.marathonMaxLives || 3;

  if (state.gameMode === "blitz") {
    state.blitzRemainingSeconds = state.blitzDuration;
    state.blitzTotalSeconds = state.blitzDuration;
  } else {
    state.blitzRemainingSeconds = null;
    state.blitzTotalSeconds = null;
  }

  setupRound(0);
  switchScreen("screenLeaderIntro");
}

export function setupRound(roundIndex) {
  state.currentRoundIndex = roundIndex;
  const isMarathon = state.gameMode === "marathon";
  const totalRounds = isMarathon ? null : state.players.length * state.roundsPerPlayer;
  const startLeaderIdx =
    typeof state.firstLeaderIndex === "number" &&
    state.firstLeaderIndex >= 0 &&
    state.firstLeaderIndex < state.players.length
      ? state.firstLeaderIndex
      : 0;
  const leaderName = state.players[(startLeaderIdx + roundIndex) % state.players.length];
  const selectedDecks = getSelectedDecks(state);
  const deckNames = selectedDecks
    .map((d) => (typeof d.name === "object" ? d.name[state.lang] || d.name.ru || d.id : d.name || d.id))
    .join(" + ");

  const distractorCount = getEffectiveDistractorCount(state);
  const { cloverCards, fakeCards, fakeCard } = generateRoundCards(state, distractorCount);

  // Initialize secret board with 4 cards and random rotations
  const secretBoard = cloverCards.map((card) => ({
    card,
    rotation: Math.floor(Math.random() * 4)
  }));

  state.activeRound = {
    roundNum: roundIndex + 1,
    totalRounds,
    gameMode: state.gameMode,
    distractorCount,
    leaderName,
    deckId: state.selectedDeckIds.join(","),
    deckName: deckNames,
    deckMode: state.deckMode,
    secretBoard,
    fakeCards,
    fakeCard,
    clues: { north: "", east: "", south: "", west: "" },
    attempt: 1,
    teamBoard: [null, null, null, null],
    trayCards: [],
    selectedTrayCardId: null,
    lastRoundPoints: 0,
    wasFirstAttemptSuccess: false,
    lostLife: false,
    blitzBonusAdded: 0,
    summaryViewMode: "secret"
  };

  saveState();
}

function getTeamCallbacks() {
  return {
    showAttemptModal,
    onFinished: () => switchScreen("screenSummary"),
    onBlitzGameOver: () => {
      recordActiveRoundToHistory();
      switchScreen("screenGameOver");
    }
  };
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
export function syncSettingsModalUI() {
  const t = getT();
  applyTheme(state.theme);

  const btnSettings = document.getElementById("btnOpenSettings");
  if (btnSettings) {
    btnSettings.title = t.settingsBtnTooltip;
    btnSettings.setAttribute("aria-label", t.settingsBtnTooltip);
  }

  const btnSound = document.getElementById("btnToggleSound");
  if (btnSound) {
    const soundOn = state.soundEnabled !== false;
    btnSound.classList.toggle("active", soundOn);
    btnSound.setAttribute("aria-checked", soundOn ? "true" : "false");
  }

  const btnVib = document.getElementById("btnToggleVibration");
  if (btnVib) {
    const vibOn = state.vibrationEnabled !== false;
    btnVib.classList.toggle("active", vibOn);
    btnVib.setAttribute("aria-checked", vibOn ? "true" : "false");
  }

  const btnDark = document.getElementById("btnThemeDark");
  const btnLight = document.getElementById("btnThemeLight");
  if (btnDark) btnDark.classList.toggle("active", state.theme !== "light");
  if (btnLight) btnLight.classList.toggle("active", state.theme === "light");

  const btnRu = document.getElementById("btnLangRu");
  const btnEn = document.getElementById("btnLangEn");
  if (btnRu) btnRu.classList.toggle("active", state.lang !== "en");
  if (btnEn) btnEn.classList.toggle("active", state.lang === "en");
}

export function updateLanguageUI() {
  const t = getT();
  document.documentElement.lang = state.lang;
  document.title = t.pageTitle;

  // Top header
  setText("txtHeaderTitle", t.appTitle);
  setText("txtHeaderSubtitle", t.subtitle);
  setText("txtScoreLabel", t.scoreLabel);
  setText("txtScoreValue", state.totalScore);
  setText("txtInstallBtn", t.installBtn);
  setText("lblCurrentLang", state.lang.toUpperCase());

  const btnLangHeader = document.getElementById("btnToggleLang");
  if (btnLangHeader) {
    btnLangHeader.title = t.langBtnTooltip;
    btnLangHeader.setAttribute("aria-label", t.langBtnTooltip);
  }

  const btnLogo = document.getElementById("btnHeaderLogo");
  if (btnLogo) btnLogo.title = t.logoResetTooltip;
  const btnRules = document.getElementById("btnOpenRules");
  if (btnRules) {
    btnRules.title = t.rulesBtnTooltip;
    btnRules.setAttribute("aria-label", t.rulesBtnTooltip);
  }

  // Quick Settings Modal labels
  setText("txtSettingsModalTitle", t.settingsModalTitle);
  setText("txtSoundLabel", t.soundLabel);
  setText("txtSoundDesc", t.soundDesc);
  setText("txtVibrationLabel", t.vibrationLabel);
  setText("txtVibrationDesc", t.vibrationDesc);
  setText("txtThemeLabel", t.themeLabel);
  setText("btnThemeDark", t.themeDark);
  setText("btnThemeLight", t.themeLight);
  setText("txtLangLabel", t.langLabel);
  setText("txtReinstallLabel", t.reinstallLabel);
  setText("txtReinstallDesc", t.reinstallDesc);
  setText("txtReinstallBtn", t.btnReinstallApp);
  setText("btnDoneSettings", t.btnDone);
  syncSettingsModalUI();

  // Setup screen
  setText("txtHeroTitle", t.heroTitle);
  setText("txtDeckSelectHeader", t.deckSelectHeader);
  setText("txtResetDeckBtn", t.btnResetDeck);
  setText("txtDeckModeHeader", t.deckModeHeader);
  setText("txtModePredefinedTitle", t.modePredefinedTitle);
  setText("txtPredefinedDisabled", t.txtPredefinedDisabled);
  setText("txtModeRandomTitle", t.modeRandomTitle);

  // Extended Game Mode labels
  setText("txtGameModeHeader", t.gameModeHeader);
  setText("txtGameModeClassicTitle", t.gameModeClassicTitle);
  setText("txtGameModeClassicBadge", t.gameModeClassicBadge);
  setText("txtGameModeClassicDesc", t.gameModeClassicDesc);
  setText("txtGameModeHardTitle", t.gameModeHardTitle);
  setText("txtGameModeHardBadge", t.gameModeHardBadge);
  setText("txtGameModeHardDesc", t.gameModeHardDesc);
  setText("txtGameModeBlitzTitle", t.gameModeBlitzTitle);
  setText("txtGameModeBlitzBadge", t.gameModeBlitzBadge);
  setText("txtGameModeBlitzDesc", t.gameModeBlitzDesc);
  setText("txtGameModeMarathonTitle", t.gameModeMarathonTitle);
  setText("txtGameModeMarathonBadge", t.gameModeMarathonBadge);
  setText("txtGameModeMarathonDesc", t.gameModeMarathonDesc);
  setText("txtExtraCardsLabel", t.extraCardsLabel);

  setText("txtTimerSelectHeader", state.gameMode === "blitz" ? t.timerHeaderBlitz : t.timerHeader);
  setText("btnTimer0", t.timerOptOff);
  setText("btnTimer60", t.timerOpt1m);
  setText("btnTimer120", t.timerOpt2m);
  setText("btnTimer180", t.timerOpt3m);
  setText("btnTimer300", t.timerOpt5m);
  setText("btnBlitz300", t.timerOpt5m);
  setText("btnBlitz480", t.timerOpt8m);
  setText("btnBlitz600", t.timerOpt10m);
  setText("btnBlitz900", t.timerOpt15m);
  setText("txtPlayersHeader", t.playersHeader);
  setText("txtNoLimit", t.noLimit);
  setText("btnAddPlayer", t.btnAddPlayer);
  setText("txtCloversPerPlayer", t.cloversPerPlayer);
  setText("txtMarathonEndlessHint", t.marathonEndlessHint);
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
  setText("txtShuffleTrayBtn", t.btnShuffleTray);
  const btnShuffle = document.getElementById("btnShuffleTray");
  if (btnShuffle) btnShuffle.title = t.shuffleTrayTooltip;
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
  setText("txtOfflineBadge", t.offlineBadge);
  setText("txtIosInstallTitle", t.iosInstallTitle);
  setText("btnAckIosInstall", t.btnUnderstood);

  const iosBody = document.getElementById("txtIosInstallBody");
  if (iosBody) {
    iosBody.innerHTML = `
      <p style="margin-bottom: 10px;">${t.iosInstallIntro}</p>
      <ol style="padding-left: 20px; line-height: 1.7;">
        <li>${t.iosStep1}</li>
        <li>${t.iosStep2}</li>
        <li>${t.iosStep3}</li>
      </ol>
    `;
  }

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
      haptics.tap();
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
    haptics.tap();
    const modal = document.getElementById("modalConfirmReset");
    if (modal) modal.classList.remove("active");
  };

  if (btnCloseReset) btnCloseReset.addEventListener("click", closeResetModal);
  if (btnCancelReset) btnCancelReset.addEventListener("click", closeResetModal);

  if (btnExecReset) {
    btnExecReset.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      closeResetModal();
      stopTeamGuessingPhase();
      state.screen = "screenSetup";
      state.currentRoundIndex = 0;
      state.totalScore = 0;
      state.roundHistory = [];
      state.matchUsedWords = [];
      state.activeRound = null;
      state.blitzRemainingSeconds = null;
      state.blitzTotalSeconds = null;
      state.blitzTimedOut = false;
      state.marathonLives = state.marathonMaxLives || 3;
      saveState();
      switchScreen("screenSetup");
    });
  }

  // 1b. Standalone Header Language Toggle (RU <-> EN mid-game)
  const btnToggleLang = document.getElementById("btnToggleLang");
  if (btnToggleLang) {
    btnToggleLang.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      state.lang = state.lang === "ru" ? "en" : "ru";
      saveState();
      updateLanguageUI();
    });
  }

  // 2. Quick Settings Modal (Sound, Vibration, Theme, Language)
  const modalSettings = document.getElementById("modalSettings");
  const btnOpenSettings = document.getElementById("btnOpenSettings");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const btnDoneSettings = document.getElementById("btnDoneSettings");

  const closeSettingsModal = () => {
    sounds.tap();
    haptics.tap();
    if (modalSettings) modalSettings.classList.remove("active");
  };

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      syncSettingsModalUI();
      const statusEl = document.getElementById("txtReinstallStatus");
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.style.display = "none";
        statusEl.classList.remove("is-error");
      }
      if (modalSettings) modalSettings.classList.add("active");
    });
  }
  if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettingsModal);
  if (btnDoneSettings) btnDoneSettings.addEventListener("click", closeSettingsModal);
  if (modalSettings) {
    modalSettings.addEventListener("click", (e) => {
      if (e.target === modalSettings) closeSettingsModal();
    });
  }

  // Safe App Reinstall / Update inside Quick Settings (preserves all saves)
  const btnReinstallApp = document.getElementById("btnReinstallApp");
  if (btnReinstallApp) {
    btnReinstallApp.addEventListener("click", () => {
      reinstallAppPreservingSaves();
    });
  }

  // Sound toggle inside Quick Settings
  const btnToggleSound = document.getElementById("btnToggleSound");
  if (btnToggleSound) {
    btnToggleSound.addEventListener("click", () => {
      state.soundEnabled = state.soundEnabled === false;
      haptics.tap();
      if (state.soundEnabled) {
        sounds.init();
        sounds.tap();
      }
      saveState();
      syncSettingsModalUI();
    });
  }

  // Vibration toggle inside Quick Settings
  const btnToggleVibration = document.getElementById("btnToggleVibration");
  if (btnToggleVibration) {
    btnToggleVibration.addEventListener("click", () => {
      sounds.tap();
      state.vibrationEnabled = state.vibrationEnabled === false;
      if (state.vibrationEnabled) {
        haptics.place();
      }
      saveState();
      syncSettingsModalUI();
    });
  }

  // Theme segmented control inside Quick Settings
  const btnThemeDark = document.getElementById("btnThemeDark");
  const btnThemeLight = document.getElementById("btnThemeLight");
  if (btnThemeDark) {
    btnThemeDark.addEventListener("click", () => {
      if (state.theme === "dark") return;
      sounds.tap();
      haptics.tap();
      state.theme = "dark";
      saveState();
      syncSettingsModalUI();
    });
  }
  if (btnThemeLight) {
    btnThemeLight.addEventListener("click", () => {
      if (state.theme === "light") return;
      sounds.tap();
      haptics.tap();
      state.theme = "light";
      saveState();
      syncSettingsModalUI();
    });
  }

  // Language segmented control inside Quick Settings
  const btnLangRu = document.getElementById("btnLangRu");
  const btnLangEn = document.getElementById("btnLangEn");
  if (btnLangRu) {
    btnLangRu.addEventListener("click", () => {
      if (state.lang === "ru") return;
      sounds.tap();
      haptics.tap();
      state.lang = "ru";
      saveState();
      updateLanguageUI();
    });
  }
  if (btnLangEn) {
    btnLangEn.addEventListener("click", () => {
      if (state.lang === "en") return;
      sounds.tap();
      haptics.tap();
      state.lang = "en";
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
      haptics.tap();
      const modal = document.getElementById("modalRules");
      if (modal) modal.classList.add("active");
    });
  }

  const closeRulesModal = () => {
    sounds.tap();
    haptics.tap();
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
            haptics.tap();
            state.selectedDeckIds = state.selectedDeckIds.filter((id) => id !== deckId);
          }
        } else {
          sounds.tap();
          haptics.tap();
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

  // Reset used cards/words history for selected decks
  const btnResetDeck = document.getElementById("btnResetDeckHistory");
  if (btnResetDeck) {
    btnResetDeck.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      resetSelectedDecksHistory(state);
      saveState();
      renderSetupScreen();
      showRestoreToast(getT().deckResetToast);
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
      haptics.tap();
      state.deckMode = "predefined";
      saveState();
      renderSetupScreen();
    });
  }

  if (btnModeRnd) {
    btnModeRnd.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      state.deckMode = "random";
      saveState();
      renderSetupScreen();
    });
  }

  // Game mode selection in setup screen
  document.querySelectorAll(".game-mode-card[data-game-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-game-mode");
      if (!["classic", "hard", "blitz", "marathon"].includes(mode)) return;
      const prevMode = state.gameMode;
      sounds.tap();
      haptics.tap();
      state.gameMode = mode;
      if (mode === "hard" && state.distractorCount < 2) {
        state.distractorCount = 2;
      } else if (prevMode === "hard" && mode !== "hard" && state.distractorCount === 2) {
        state.distractorCount = 1;
      }
      saveState();
      renderSetupScreen();
    });
  });

  // Extra distractor cards stepper (- / +)
  const btnExtraDec = document.getElementById("btnExtraCardsDec");
  const btnExtraInc = document.getElementById("btnExtraCardsInc");
  if (btnExtraDec) {
    btnExtraDec.addEventListener("click", () => {
      const minTraps = state.gameMode === "hard" ? 2 : 0;
      const current = getEffectiveDistractorCount(state);
      if (current <= minTraps) return;
      sounds.tap();
      haptics.tap();
      state.distractorCount = current - 1;
      saveState();
      renderSetupScreen();
    });
  }
  if (btnExtraInc) {
    btnExtraInc.addEventListener("click", () => {
      const current = getEffectiveDistractorCount(state);
      if (current >= MAX_DISTRACTOR_CARDS) return;
      sounds.tap();
      haptics.tap();
      state.distractorCount = current + 1;
      saveState();
      renderSetupScreen();
    });
  }

  // Timer options in setup screen
  document.querySelectorAll(".btn-timer-opt[data-timer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      state.timerSetting = parseInt(btn.getAttribute("data-timer"), 10) || 0;
      saveState();
      renderSetupScreen();
    });
  });

  // Blitz shared time bank options in setup screen
  document.querySelectorAll(".btn-blitz-opt[data-blitz]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      state.blitzDuration = parseInt(btn.getAttribute("data-blitz"), 10) || 480;
      saveState();
      renderSetupScreen();
    });
  });

  // Rounds per player
  document.querySelectorAll(".btn-round-opt[data-rounds]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
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
        haptics.tap();
        state.players.push(val);
        if (inputNewPlayer) inputNewPlayer.value = "";
        saveState();
        renderSetupScreen();
      }
    });
  }

  // Delete player or select 1st leader by clicking player row
  const playersList = document.getElementById("playersListContainer");
  if (playersList) {
    playersList.addEventListener("click", (e) => {
      const btnDel = e.target.closest('[data-action="delete-player"]');
      if (btnDel) {
        const idx = parseInt(btnDel.getAttribute("data-idx"), 10);
        if (state.players.length > 2 && !Number.isNaN(idx)) {
          sounds.tap();
          haptics.tap();
          state.players.splice(idx, 1);
          const curLeader = typeof state.firstLeaderIndex === "number" ? state.firstLeaderIndex : 0;
          if (idx < curLeader) {
            state.firstLeaderIndex = Math.max(0, curLeader - 1);
          } else if (curLeader >= state.players.length) {
            state.firstLeaderIndex = 0;
          }
          saveState();
          renderSetupScreen();
        }
        return;
      }

      const playerRow = e.target.closest('[data-action="set-leader"]');
      if (playerRow) {
        const idx = parseInt(playerRow.getAttribute("data-idx"), 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < state.players.length && state.firstLeaderIndex !== idx) {
          sounds.tap();
          haptics.tap();
          state.firstLeaderIndex = idx;
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
      haptics.tap();
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

  // Leader card rotation (rotate button or double-tap on card)
  const leaderScreen = document.getElementById("screenLeaderWriting");
  if (leaderScreen) {
    leaderScreen.addEventListener("click", (e) => {
      const rotateBtn = e.target.closest('[data-action="rotate"]');
      if (rotateBtn) {
        const cardId = rotateBtn.getAttribute("data-card-id");
        if (cardId) rotateLeaderCard(cardId);
        return;
      }
      const cardEl = e.target.closest(".game-card");
      if (cardEl) {
        const cardId = cardEl.getAttribute("data-card-id");
        if (cardId) handleLeaderCardTap(cardId);
      }
    });
  }

  // Team Handoff: Ready to guess
  const btnStartTeam = document.getElementById("btnStartTeamGuessing");
  if (btnStartTeam) {
    btnStartTeam.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      switchScreen("screenTeamGuessing");
    });
  }

  // Team Guessing: Click handling on rotate buttons and empty slots
  const teamScreen = document.getElementById("screenTeamGuessing");
  if (teamScreen) {
    teamScreen.addEventListener("click", (e) => {
      handleSlotOrCardTap(e.target);
    });
  }

  // Initialize unified Pointer/Touch Drag and Drop + Card Single/Double Tap + Center Rotate Drag
  initDragAndDrop({
    getRound: () => state.activeRound,
    onStateChange: () => {
      saveState();
      renderTeamGuessingScreen();
    },
    onCardClick: (cardEl, cardId) => {
      handleTeamCardPointerTap(cardEl, cardId);
    },
    onRotateClick: (cardId) => {
      cancelPendingCardTap();
      rotateCard(cardId);
    },
    onDragStart: () => {
      cancelPendingCardTap();
    }
  });

  // Team Guessing: Sand timer controls
  const btnTimerToggle = document.getElementById("btnTimerToggle");
  if (btnTimerToggle) {
    btnTimerToggle.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      sandTimer.toggle();
      persistTimerSnapshot();
    });
  }

  const btnTimerAdd30 = document.getElementById("btnTimerAdd30");
  if (btnTimerAdd30) {
    btnTimerAdd30.addEventListener("click", () => {
      if (state.activeRound && state.activeRound.gameMode === "blitz") return;
      sounds.tap();
      haptics.tap();
      sandTimer.addSeconds(30);
      persistTimerSnapshot();
    });
  }

  const btnDismissTimerBanner = document.getElementById("btnDismissTimerBanner");
  if (btnDismissTimerBanner) {
    btnDismissTimerBanner.addEventListener("click", () => {
      haptics.tap();
      const banner = document.getElementById("timerExpiredBanner");
      if (banner) banner.classList.remove("active");
    });
  }

  const btnShuffleTray = document.getElementById("btnShuffleTray");
  if (btnShuffleTray) {
    btnShuffleTray.addEventListener("click", shuffleTrayCards);
  }

  const btnResetTray = document.getElementById("btnClearBoardToTray");
  if (btnResetTray) {
    btnResetTray.addEventListener("click", resetBoardToTray);
  }

  const btnCheckSol = document.getElementById("btnCheckSolution");
  if (btnCheckSol) {
    btnCheckSol.addEventListener("click", () => {
      checkTeamSolution(getTeamCallbacks());
    });
  }

  // Summary Screen: Toggle secret/team view
  const btnToggleSecret = document.getElementById("btnToggleSecretView");
  const btnToggleTeam = document.getElementById("btnToggleTeamView");

  if (btnToggleSecret) {
    btnToggleSecret.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      if (state.activeRound) {
        state.activeRound.summaryViewMode = "secret";
        renderSummaryScreen();
      }
    });
  }

  if (btnToggleTeam) {
    btnToggleTeam.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
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

  // Summary Screen: Voluntary Finish Marathon button
  const btnStopMarathon = document.getElementById("btnStopMarathon");
  if (btnStopMarathon) {
    btnStopMarathon.addEventListener("click", () => {
      sounds.fanfare();
      haptics.fanfare();
      recordActiveRoundToHistory();
      saveState();
      switchScreen("screenGameOver");
    });
  }

  // Game Over: Play Again
  const btnPlayAgain = document.getElementById("btnPlayAgain");
  if (btnPlayAgain) {
    btnPlayAgain.addEventListener("click", () => {
      sounds.tap();
      haptics.tap();
      state.screen = "screenSetup";
      state.currentRoundIndex = 0;
      state.totalScore = 0;
      state.roundHistory = [];
      state.matchUsedWords = [];
      state.activeRound = null;
      state.blitzRemainingSeconds = null;
      state.blitzTotalSeconds = null;
      state.blitzTimedOut = false;
      state.marathonLives = state.marathonMaxLives || 3;
      saveState();
      switchScreen("screenSetup");
    });
  }

  // PWA Install Prompt (Chromium beforeinstallprompt + iOS Safari fallback)
  setupPwaInstallUI();

  // Offline / Online Connectivity Indicator
  setupOfflineIndicator();

  // Save state safely before page reload/suspension & guard active matches against accidental reload
  const flushMatchState = () => {
    persistTimerSnapshot();
    saveState();
  };

  window.addEventListener("beforeunload", (e) => {
    flushMatchState();
    if (isReinstallingApp) return;
    const isMatchInProgress =
      state.screen !== "screenSetup" &&
      state.screen !== "screenGameOver" &&
      Boolean(state.activeRound);
    if (isMatchInProgress) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.addEventListener("pagehide", flushMatchState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushMatchState();
    }
  });
}

async function reinstallAppPreservingSaves() {
  const t = getT();
  const btn = document.getElementById("btnReinstallApp");
  const statusEl = document.getElementById("txtReinstallStatus");

  // Never wipe offline cache when the user has no internet connection
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    sounds.miss();
    haptics.miss();
    if (statusEl) {
      statusEl.textContent = t.reinstallOfflineError;
      statusEl.classList.add("is-error");
      statusEl.style.display = "block";
    }
    return;
  }

  sounds.tap();
  haptics.tap();

  if (btn) btn.disabled = true;
  if (statusEl) {
    statusEl.textContent = t.reinstallWorking;
    statusEl.classList.remove("is-error");
    statusEl.style.display = "block";
  }

  // 1. Flush current state & timer to localStorage/sessionStorage (NEVER touch saved data!)
  persistTimerSnapshot();
  saveState();
  isReinstallingApp = true;

  const scopeUrl = new URL("./", window.location.href).href;
  const scopeSlug =
    new URL(scopeUrl).pathname
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/^_+|_+$/g, "") || "root";
  const cachePrefix = `udachnye-slova-so-clover-${scopeSlug}-`;

  try {
    // 2. Delete ONLY caches belonging to THIS exact app scope (isolates sibling apps on same origin)
    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      const keys = await caches.keys();
      await Promise.allSettled(
        keys
          .filter((key) => key.startsWith(cachePrefix))
          .map((key) => caches.delete(key))
      );
    }

    // 3. Unregister ONLY THIS app's scoped Service Worker so fresh assets & new SW install on reload
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("./");
      if (reg && reg.scope === scopeUrl) {
        await reg.unregister();
      } else if (typeof navigator.serviceWorker.getRegistrations === "function") {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(
          regs.filter((r) => r.scope === scopeUrl).map((r) => r.unregister())
        );
      }
    }
  } catch (_) {
    // Proceed to fresh reload even if SW/Cache API is restricted
  }

  // 4. Reload with a temporary cache-busting query param (stripped on next boot)
  const reloadUrl = new URL(window.location.href);
  reloadUrl.searchParams.set("_reinstall", Date.now().toString(36));
  window.location.replace(reloadUrl.href);
}

function showRestoreToast(message) {
  const toast = document.getElementById("restoreToast");
  if (!toast || !message) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3600);
}

function setupPwaInstallUI() {
  const btnPwa = document.getElementById("btnPwaInstall");
  const modalIos = document.getElementById("modalIosInstall");
  const btnCloseIos = document.getElementById("btnCloseIosInstall");
  const btnAckIos = document.getElementById("btnAckIosInstall");

  const closeIosModal = () => {
    sounds.tap();
    haptics.tap();
    if (modalIos) modalIos.classList.remove("active");
  };
  if (btnCloseIos) btnCloseIos.addEventListener("click", closeIosModal);
  if (btnAckIos) btnAckIos.addEventListener("click", closeIosModal);

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    if (btnPwa) btnPwa.style.display = "none";
    return;
  }

  const ua = (window.navigator.userAgent || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  let deferredPrompt = null;

  if (isIOS && btnPwa) {
    btnPwa.style.display = "inline-flex";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnPwa) {
      btnPwa.style.display = "inline-flex";
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (btnPwa) btnPwa.style.display = "none";
  });

  if (btnPwa) {
    btnPwa.addEventListener("click", async () => {
      sounds.tap();
      haptics.tap();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          btnPwa.style.display = "none";
        }
        deferredPrompt = null;
      } else if (isIOS && modalIos) {
        modalIos.classList.add("active");
      }
    });
  }
}

function setupOfflineIndicator() {
  const indicator = document.getElementById("offlineIndicator");
  if (!indicator) return;

  const updateOnlineState = () => {
    indicator.classList.toggle("visible", !navigator.onLine);
  };

  window.addEventListener("online", () => {
    updateOnlineState();
    // Re-check decks/ when connection returns
    discoverExtraDecks(() => {
      syncSelectedDecksWithAvailable();
      if (state.screen === "screenSetup") renderSetupScreen();
    });
  });
  window.addEventListener("offline", updateOnlineState);
  updateOnlineState();
}

function registerScopedServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  // Strictly register with relative scope './' so it NEVER affects sibling apps
  // hosted on the same GitHub Pages domain!
  navigator.serviceWorker
    .register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then(async (registration) => {
      const extraUrls = AVAILABLE_DECKS.filter((d) => d.fileName).map(
        (d) => new URL(`./decks/${encodeURIComponent(d.fileName)}`, window.location.href).href
      );
      if (extraUrls.length === 0) return;

      const worker = registration.active || (await navigator.serviceWorker.ready)?.active;
      if (worker) {
        worker.postMessage({ type: "CACHE_URLS", urls: extraUrls });
      }
    })
    .catch(() => {});
}

function setupScreenWakeLock() {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator) || !navigator.wakeLock) return;

  let wakeLockSentinel = null;
  let isRequesting = false;

  const acquireWakeLock = async () => {
    if (wakeLockSentinel || isRequesting) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isRequesting = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockSentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLockSentinel === sentinel) {
          wakeLockSentinel = null;
        }
      });
    } catch (_) {
      // Silently ignore if blocked until first user gesture or low-battery restriction
    } finally {
      isRequesting = false;
    }
  };

  // Attempt immediately when page is visible
  acquireWakeLock();

  // Re-acquire automatically whenever returning to the app/tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      acquireWakeLock();
    }
  });
  window.addEventListener("focus", acquireWakeLock);
  window.addEventListener("pageshow", acquireWakeLock);

  // Mobile browsers (e.g. iOS Safari) may require a user gesture to grant initial wake lock
  const onUserGesture = () => {
    if (!wakeLockSentinel) {
      acquireWakeLock();
    }
  };
  window.addEventListener("pointerdown", onUserGesture, { passive: true });
  window.addEventListener("touchstart", onUserGesture, { passive: true });
  window.addEventListener("keydown", onUserGesture, { passive: true });
}

// ============================================================================
// 6. INITIALIZATION ON DOM READY
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.theme);
  registerScopedServiceWorker();
  setupScreenWakeLock();
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

  const isGameOverRecoverable =
    state.screen === "screenGameOver" && Array.isArray(state.roundHistory) && state.roundHistory.length > 0;
  const isActiveRoundRecoverable =
    state.screen !== "screenSetup" && state.screen !== "screenGameOver" && Boolean(state.activeRound);

  if (!validScreens.includes(state.screen) || (!isActiveRoundRecoverable && !isGameOverRecoverable && state.screen !== "screenSetup")) {
    state.screen = "screenSetup";
  }

  setTeamScreenCallbacks(getTeamCallbacks());
  switchScreen(state.screen);

  // Restore any pending attempt result modal if reloaded mid-evaluation
  restorePendingAttemptModal(getTeamCallbacks());

  // Check if page was just safely reinstalled/updated via Quick Settings
  const bootUrl = new URL(window.location.href);
  const wasReinstalled = bootUrl.searchParams.has("_reinstall");
  if (wasReinstalled) {
    bootUrl.searchParams.delete("_reinstall");
    try {
      window.history.replaceState({}, "", bootUrl.pathname + bootUrl.search + bootUrl.hash);
    } catch (_) {}
  }

  // Notify user subtly when updated or when an active/finished match was recovered across reload
  const t = getT();
  if (wasReinstalled) {
    showRestoreToast(t.reinstallSuccessToast);
  } else if (isActiveRoundRecoverable && state.activeRound) {
    showRestoreToast(t.gameRestoredToast(state.activeRound.roundNum, state.activeRound.totalRounds));
  } else if (isGameOverRecoverable) {
    showRestoreToast(t.gameOverRestoredToast);
  }

  // Auto-discover any extra .js deck files placed in decks/
  discoverExtraDecks(() => {
    syncSelectedDecksWithAvailable();
    if (state.screen === "screenSetup") {
      renderSetupScreen();
    }
  });
});
