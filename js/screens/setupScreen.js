/**
 * Setup Screen Controller
 * Multi-deck selection, deck exhaustion stats/reset, usage modes, sand timer options,
 * player roster, and game start.
 */
import { AVAILABLE_DECKS, getSelectedDecks } from "../decks.js";
import {
  getDeckUsageStats,
  getSelectedDecksUsageSummary,
  getEffectiveDistractorCount,
  MAX_DISTRACTOR_CARDS
} from "../gameLogic.js";
import { state, saveState, getT } from "../state.js";
import { escapeHtml } from "../components/cardRenderer.js";

export function renderSetupScreen() {
  const t = getT();
  const selectedDecks = getSelectedDecks(state);
  const hasAnyPredefined = selectedDecks.some((d) => d.hasPredefinedCards);

  // If no selected deck has predefined cards, force random mode
  if (!hasAnyPredefined && state.deckMode !== "random") {
    state.deckMode = "random";
    saveState();
  }

  const effectiveMode = !hasAnyPredefined ? "random" : state.deckMode;

  // 1. Render Decks List with multi-select checkboxes & remaining progress
  const decksContainer = document.getElementById("decksListContainer");
  if (decksContainer) {
    decksContainer.innerHTML = AVAILABLE_DECKS.map((deck) => {
      const isSelected = state.selectedDeckIds.includes(deck.id);
      const deckName = typeof deck.name === "object" ? (deck.name[state.lang] || deck.name.ru || deck.id) : deck.name;
      const stats = getDeckUsageStats(deck, state, effectiveMode);

      let badgeHtml;
      if (deck.hasPredefinedCards) {
        const label =
          stats.unit === "cards"
            ? stats.used > 0
              ? t.badgeCardsProgress(stats.remaining, stats.total)
              : t.badgeCardsWord(deck.cardsCount)
            : stats.used > 0
              ? t.badgeWordsProgress(stats.remaining, stats.total)
              : t.badgeWordsWord(deck.wordsCount);
        badgeHtml = `<span class="deck-badge-cards">${label}</span>`;
      } else {
        const label =
          stats.used > 0
            ? t.badgeWordsProgress(stats.remaining, stats.total)
            : t.badgeWordsWord(deck.wordsCount);
        badgeHtml = `<span class="deck-badge-wordonly">${label}</span>`;
      }

      return `
        <button type="button" class="deck-choice-card ${isSelected ? "active" : ""}" data-deck-id="${escapeHtml(deck.id)}">
          <div class="deck-choice-header">
            <div class="deck-choice-title">
              <span class="deck-checkbox">${isSelected ? "✓" : ""}</span>
              <span class="deck-name-text">${escapeHtml(deckName)}</span>
            </div>
            ${badgeHtml}
          </div>
        </button>
      `;
    }).join("");
  }

  setText("badgeTotalDecks", t.totalDecksCount(selectedDecks.length, AVAILABLE_DECKS.length));

  // Deck remaining summary & Reset Deck button
  const usageSummary = getSelectedDecksUsageSummary(state);
  const remainingText =
    usageSummary.unit === "cards"
      ? t.deckRemainingCards(usageSummary.remaining, usageSummary.total)
      : t.deckRemainingWords(usageSummary.remaining, usageSummary.total);
  setText("txtDeckRemainingInfo", remainingText);

  const btnResetDeck = document.getElementById("btnResetDeckHistory");
  if (btnResetDeck) {
    btnResetDeck.disabled = !usageSummary.anyUsed;
    btnResetDeck.classList.toggle("has-used", usageSummary.anyUsed);
  }

  // 2. Mode buttons & lock state
  const btnPredefined = document.getElementById("btnModePredefined");
  const btnRandom = document.getElementById("btnModeRandom");
  const disabledNotice = document.getElementById("deckPredefinedDisabledNotice");

  const totalPredefinedCards = selectedDecks
    .filter((d) => d.hasPredefinedCards)
    .reduce((acc, d) => acc + d.cards.length, 0);
  const totalWords = selectedDecks.reduce((acc, d) => acc + d.wordsCount, 0);

  setText("badgeCardsCount", t.badgeCardsWord(totalPredefinedCards > 0 ? totalPredefinedCards : Math.floor(totalWords / 4)));
  setText("badgeWordsCount", t.badgeWordsWord(totalWords));

  if (!hasAnyPredefined) {
    if (btnPredefined) {
      btnPredefined.classList.add("disabled");
      btnPredefined.classList.remove("active");
      btnPredefined.disabled = true;
    }
    if (disabledNotice) disabledNotice.style.display = "flex";
    if (btnRandom) {
      btnRandom.classList.add("active");
      btnRandom.disabled = false;
    }
  } else {
    if (btnPredefined) {
      btnPredefined.classList.remove("disabled");
      btnPredefined.disabled = false;
      btnPredefined.classList.toggle("active", state.deckMode === "predefined");
    }
    if (disabledNotice) disabledNotice.style.display = "none";
    if (btnRandom) {
      btnRandom.disabled = false;
      btnRandom.classList.toggle("active", state.deckMode === "random");
    }
  }

  // 3. Game Mode Selection (Classic, Hard, Blitz, Marathon) + Extra Cards Stepper
  document.querySelectorAll(".game-mode-card[data-game-mode]").forEach((btn) => {
    const mode = btn.getAttribute("data-game-mode");
    btn.classList.toggle("active", mode === state.gameMode);
  });

  const minTraps = state.gameMode === "hard" ? 2 : 0;
  const trapsCount = getEffectiveDistractorCount(state);
  if (state.distractorCount !== trapsCount) {
    state.distractorCount = trapsCount;
    saveState();
  }
  setText("txtExtraCardsCount", trapsCount > 0 ? `+${trapsCount}` : "0");
  setText("txtExtraCardsTotal", t.extraCardsTotal(4 + trapsCount));

  const btnDec = document.getElementById("btnExtraCardsDec");
  const btnInc = document.getElementById("btnExtraCardsInc");
  if (btnDec) btnDec.disabled = trapsCount <= minTraps;
  if (btnInc) btnInc.disabled = trapsCount >= MAX_DISTRACTOR_CARDS;

  const bestBadge = document.getElementById("badgeMarathonBest");
  if (bestBadge) {
    if (state.bestMarathonClovers > 0) {
      bestBadge.textContent = t.marathonRecordBadge(state.bestMarathonClovers);
      bestBadge.style.display = "inline-block";
    } else {
      bestBadge.style.display = "none";
    }
  }

  // 4. Sand Timer vs Blitz Bank Setting Options
  const isBlitz = state.gameMode === "blitz";
  const timerStdGrid = document.getElementById("timerStandardGrid");
  const timerBlitzGrid = document.getElementById("timerBlitzGrid");
  if (timerStdGrid) timerStdGrid.style.display = isBlitz ? "none" : "grid";
  if (timerBlitzGrid) timerBlitzGrid.style.display = isBlitz ? "grid" : "none";
  setText("txtTimerSelectHeader", isBlitz ? t.timerHeaderBlitz : t.timerHeader);

  document.querySelectorAll(".btn-timer-opt[data-timer]").forEach((btn) => {
    const val = parseInt(btn.getAttribute("data-timer"), 10);
    btn.classList.toggle("active", val === state.timerSetting);
  });

  document.querySelectorAll(".btn-blitz-opt[data-blitz]").forEach((btn) => {
    const val = parseInt(btn.getAttribute("data-blitz"), 10);
    btn.classList.toggle("active", val === state.blitzDuration);
  });

  // 5. Rounds buttons (hidden in Marathon mode where clovers are endless)
  const isMarathon = state.gameMode === "marathon";
  const roundsWrap = document.getElementById("roundsOptionsWrap");
  const marathonHint = document.getElementById("txtMarathonEndlessHint");
  if (roundsWrap) roundsWrap.style.display = isMarathon ? "none" : "flex";
  if (marathonHint) {
    marathonHint.style.display = isMarathon ? "inline-flex" : "none";
    marathonHint.textContent = t.marathonEndlessHint;
  }

  document.querySelectorAll(".btn-round-opt[data-rounds]").forEach((btn) => {
    const val = parseInt(btn.getAttribute("data-rounds"), 10);
    btn.classList.toggle("active", val === state.roundsPerPlayer);
  });

  // 6. Players list
  const container = document.getElementById("playersListContainer");
  if (container) {
    const firstLeaderIdx =
      typeof state.firstLeaderIndex === "number" &&
      state.firstLeaderIndex >= 0 &&
      state.firstLeaderIndex < state.players.length
        ? state.firstLeaderIndex
        : 0;

    container.innerHTML = state.players
      .map((name, idx) => {
        const isFirstLeader = idx === firstLeaderIdx;
        return `
        <div class="player-row ${isFirstLeader ? "player-row--leader" : ""}" data-action="set-leader" data-idx="${idx}" title="${isFirstLeader ? escapeHtml(t.firstLeaderBadge) : escapeHtml(t.setFirstLeaderTooltip)}">
          <div class="player-info">
            <div class="player-num">${idx + 1}</div>
            <span class="player-name">${escapeHtml(name)}</span>
            ${isFirstLeader ? `<span class="player-badge">${escapeHtml(t.firstLeaderBadge)}</span>` : ""}
          </div>
          ${
            state.players.length > 2
              ? `<button type="button" class="btn-del-player" data-action="delete-player" data-idx="${idx}" title="${escapeHtml(t.deletePlayerTooltip)}">✕</button>`
              : ""
          }
        </div>
      `;
      })
      .join("");
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
