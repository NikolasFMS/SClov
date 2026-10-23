/**
 * Setup Screen Controller
 * Multi-deck selection, usage modes, sand timer options, player roster, and game start.
 */
import { AVAILABLE_DECKS, getSelectedDecks } from "../decks.js";
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

  // 1. Render Decks List with multi-select checkboxes
  const decksContainer = document.getElementById("decksListContainer");
  if (decksContainer) {
    decksContainer.innerHTML = AVAILABLE_DECKS.map((deck) => {
      const isSelected = state.selectedDeckIds.includes(deck.id);
      const deckName = typeof deck.name === "object" ? (deck.name[state.lang] || deck.name.ru || deck.id) : deck.name;
      const deckDesc = typeof deck.description === "object" ? (deck.description[state.lang] || deck.description.ru || "") : deck.description;

      const badgeHtml = deck.hasPredefinedCards
        ? `<span class="deck-badge-cards">${t.badgeCardsWord(deck.cardsCount)} • ${t.badgeWordsWord(deck.wordsCount)}</span>`
        : `<span class="deck-badge-wordonly">${t.badgeWordsWord(deck.wordsCount)} • ${t.badgeWordListOnly}</span>`;

      return `
        <button type="button" class="deck-choice-card ${isSelected ? "active" : ""}" data-deck-id="${escapeHtml(deck.id)}">
          <div class="deck-choice-header">
            <div class="deck-choice-title">
              <span class="deck-checkbox">${isSelected ? "✓" : ""}</span>
              <strong>${escapeHtml(deckName)}</strong>
            </div>
            ${badgeHtml}
          </div>
          ${deckDesc ? `<div class="deck-choice-desc">${escapeHtml(deckDesc)}</div>` : ""}
        </button>
      `;
    }).join("");
  }

  setText("badgeTotalDecks", t.totalDecksCount(selectedDecks.length, AVAILABLE_DECKS.length));

  // 2. Mode buttons & lock state
  const btnPredefined = document.getElementById("btnModePredefined");
  const btnRandom = document.getElementById("btnModeRandom");
  const disabledNotice = document.getElementById("deckPredefinedDisabledNotice");
  const deckNoticeBanner = document.getElementById("deckNoticeBanner");

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
    if (deckNoticeBanner) deckNoticeBanner.style.display = "block";
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
    if (deckNoticeBanner) deckNoticeBanner.style.display = "none";
    if (btnRandom) {
      btnRandom.disabled = false;
      btnRandom.classList.toggle("active", state.deckMode === "random");
    }
  }

  // 3. Sand Timer Setting Options
  document.querySelectorAll(".btn-timer-opt[data-timer]").forEach((btn) => {
    const val = parseInt(btn.getAttribute("data-timer"), 10);
    btn.classList.toggle("active", val === state.timerSetting);
  });

  // Guessing tray size is a match-wide setting shared by every player.
  document.querySelectorAll(".btn-guessing-card-opt[data-distractor-cards]").forEach((btn) => {
    const val = parseInt(btn.getAttribute("data-distractor-cards"), 10);
    btn.classList.toggle("active", val === state.distractorCardCount);
  });

  // 4. Rounds buttons
  document.querySelectorAll(".btn-round-opt[data-rounds]").forEach((btn) => {
    const val = parseInt(btn.getAttribute("data-rounds"), 10);
    btn.classList.toggle("active", val === state.roundsPerPlayer);
  });

  // 5. Players list
  const container = document.getElementById("playersListContainer");
  if (container) {
    container.innerHTML = state.players
      .map(
        (name, idx) => `
        <div class="player-row">
          <div class="player-info">
            <div class="player-num">${idx + 1}</div>
            <span class="player-name">${escapeHtml(name)}</span>
            ${idx === 0 ? `<span class="player-badge">1-й ведущий</span>` : ""}
          </div>
          ${
            state.players.length > 2
              ? `<button type="button" class="btn-del-player" data-action="delete-player" data-idx="${idx}" title="Удалить">✕</button>`
              : ""
          }
        </div>
      `
      )
      .join("");
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
