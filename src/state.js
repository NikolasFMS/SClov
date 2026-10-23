/**
 * Application State Store & Persistence
 * Manages localStorage synchronization, settings, and active match state.
 */
import { AVAILABLE_DECKS } from "./decks.js";
import { I18N } from "./i18n.js";

export const STORAGE_KEY = "so_clever_saved_state_v105";

export const DEFAULT_STATE = {
  lang: "ru",
  selectedDeckIds: ["original"],
  deckMode: "predefined", // "predefined" | "random"
  timerSetting: 120, // 0 = off, 60, 120, 180, 300 seconds
  roundsPerPlayer: 1,
  players: ["Алиса", "Борис", "Вика"],
  screen: "screenSetup",
  currentRoundIndex: 0,
  totalScore: 0,
  roundHistory: [],
  activeRound: null
};

export let state = loadSavedState();

export function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.players)) {
        const loaded = { ...DEFAULT_STATE, ...parsed };

        // Migrate legacy selectedDeckId -> selectedDeckIds
        let ids = Array.isArray(loaded.selectedDeckIds) ? loaded.selectedDeckIds : [];
        if (ids.length === 0 && loaded.selectedDeckId) {
          ids = [loaded.selectedDeckId];
        }
        ids = ids.filter((id) => AVAILABLE_DECKS.some((d) => d.id === id));
        if (ids.length === 0) {
          ids = [AVAILABLE_DECKS[0]?.id || "original"];
        }
        loaded.selectedDeckIds = ids;

        if (typeof loaded.timerSetting !== "number") {
          loaded.timerSetting = 120;
        }

        const selected = AVAILABLE_DECKS.filter((d) => ids.includes(d.id));
        const hasAnyPredefined = selected.some((d) => d.hasPredefinedCards);
        if (!hasAnyPredefined) {
          loaded.deckMode = "random";
        }
        return loaded;
      }
    }
  } catch (_) {}

  const first = AVAILABLE_DECKS[0];
  const initialMode = first && !first.hasPredefinedCards ? "random" : "predefined";
  return {
    ...DEFAULT_STATE,
    selectedDeckIds: [first ? first.id : "original"],
    deckMode: initialMode
  };
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

export function getState() {
  return state;
}

export function updateState(partial) {
  Object.assign(state, partial);
  saveState();
  return state;
}

export function getT() {
  return I18N[state.lang] || I18N.ru;
}
