/**
 * Application State Store & Persistence
 * Manages isolated localStorage synchronization, settings, and active match state.
 */
import { AVAILABLE_DECKS } from "./decks.js";
import { I18N } from "./i18n.js";
import { getAppStoragePrefix, requestPersistentStorage } from "./storage.js";

const LEGACY_STORAGE_KEY = "so_clever_saved_state_v105";
export const STORAGE_KEY = `${getAppStoragePrefix()}state_v1`;

export function detectDefaultTheme() {
  try {
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch (_) {}
  return "dark";
}

export const DEFAULT_STATE = {
  lang: "ru",
  theme: detectDefaultTheme(), // "dark" | "light"
  soundEnabled: true,
  vibrationEnabled: true,
  gameMode: "classic", // "classic" | "hard" | "blitz" | "marathon"
  distractorCount: 1, // 0..8 extra distractor cards (min 2 in hard mode)
  selectedDeckIds: ["original"],
  deckMode: "predefined", // "predefined" | "random"
  timerSetting: 120, // 0 = off, 60, 120, 180, 300 seconds (for classic/hard/marathon)
  blitzDuration: 480, // 300, 480, 600, 900 seconds (shared bank for blitz mode)
  roundsPerPlayer: 1,
  players: ["Алиса", "Борис", "Вика"],
  firstLeaderIndex: 0,
  screen: "screenSetup",
  currentRoundIndex: 0,
  totalScore: 0,
  blitzRemainingSeconds: null,
  blitzTotalSeconds: null,
  blitzTimedOut: false,
  marathonLives: 3,
  marathonMaxLives: 3,
  bestMarathonClovers: 0,
  usedCardIdsByDeck: {}, // { [deckId]: string[] }
  usedWordsByDeck: {}, // { [deckId]: number[] }
  matchUsedWords: [], // normalized words already used during the current match
  roundHistory: [],
  activeRound: null
};

export let state = loadSavedState();

export function applyTheme(theme = state.theme) {
  if (typeof document === "undefined") return;
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", normalized);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", normalized === "light" ? "#f3f7f4" : "#15803d");
  }
}

export function loadSavedState() {
  try {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (_) {}

    // Fallback to sessionStorage mirror (protects reload in restricted contexts)
    if (!raw) {
      try {
        raw = sessionStorage.getItem(STORAGE_KEY);
      } catch (_) {}
    }

    // Safe read-only migration from legacy key if new namespaced save doesn't exist yet
    if (!raw) {
      try {
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          raw = legacyRaw;
        }
      } catch (_) {}
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.players)) {
        const loaded = { ...DEFAULT_STATE, ...parsed };

        if (loaded.theme !== "light" && loaded.theme !== "dark") {
          loaded.theme = detectDefaultTheme();
        }
        if (typeof loaded.soundEnabled !== "boolean") {
          loaded.soundEnabled = true;
        }
        if (typeof loaded.vibrationEnabled !== "boolean") {
          loaded.vibrationEnabled = true;
        }
        if (!["classic", "hard", "blitz", "marathon"].includes(loaded.gameMode)) {
          loaded.gameMode = "classic";
        }
        if (typeof loaded.distractorCount !== "number" || !Number.isInteger(loaded.distractorCount)) {
          loaded.distractorCount = loaded.gameMode === "hard" ? 2 : 1;
        } else {
          const minD = loaded.gameMode === "hard" ? 2 : 0;
          loaded.distractorCount = Math.max(minD, Math.min(8, loaded.distractorCount));
        }
        if (typeof loaded.blitzDuration !== "number" || loaded.blitzDuration < 60) {
          loaded.blitzDuration = 480;
        }
        if (typeof loaded.marathonLives !== "number") {
          loaded.marathonLives = 3;
        }
        if (typeof loaded.marathonMaxLives !== "number") {
          loaded.marathonMaxLives = 3;
        }
        if (typeof loaded.bestMarathonClovers !== "number") {
          loaded.bestMarathonClovers = 0;
        }
        if (!loaded.usedCardIdsByDeck || typeof loaded.usedCardIdsByDeck !== "object" || Array.isArray(loaded.usedCardIdsByDeck)) {
          loaded.usedCardIdsByDeck = {};
        } else {
          const cleanCards = {};
          for (const [k, v] of Object.entries(loaded.usedCardIdsByDeck)) {
            if (Array.isArray(v)) {
              cleanCards[k] = Array.from(new Set(v.filter((id) => typeof id === "string" && id.length > 0)));
            }
          }
          loaded.usedCardIdsByDeck = cleanCards;
        }
        if (!loaded.usedWordsByDeck || typeof loaded.usedWordsByDeck !== "object" || Array.isArray(loaded.usedWordsByDeck)) {
          loaded.usedWordsByDeck = {};
        } else {
          const cleanWords = {};
          for (const [k, v] of Object.entries(loaded.usedWordsByDeck)) {
            if (Array.isArray(v)) {
              cleanWords[k] = Array.from(
                new Set(v.filter((idx) => typeof idx === "number" && Number.isInteger(idx) && idx >= 0))
              );
            }
          }
          loaded.usedWordsByDeck = cleanWords;
        }
        if (!Array.isArray(loaded.matchUsedWords)) {
          loaded.matchUsedWords = [];
        } else {
          loaded.matchUsedWords = Array.from(
            new Set(loaded.matchUsedWords.filter((w) => typeof w === "string" && w.length > 0))
          );
        }

        // Preserve selectedDeckIds (even if an extra deck finishes loading asynchronously right after boot)
        let ids = Array.isArray(loaded.selectedDeckIds) ? loaded.selectedDeckIds : [];
        if (ids.length === 0 && loaded.selectedDeckId) {
          ids = [loaded.selectedDeckId];
        }
        ids = ids.filter((id) => typeof id === "string" && id.length > 0);
        if (ids.length === 0) {
          ids = [AVAILABLE_DECKS[0]?.id || "original"];
        }
        loaded.selectedDeckIds = ids;

        if (typeof loaded.timerSetting !== "number") {
          loaded.timerSetting = 120;
        }
        if (
          typeof loaded.firstLeaderIndex !== "number" ||
          !Number.isInteger(loaded.firstLeaderIndex) ||
          loaded.firstLeaderIndex < 0 ||
          loaded.firstLeaderIndex >= loaded.players.length
        ) {
          loaded.firstLeaderIndex = 0;
        }

        const selected = AVAILABLE_DECKS.filter((d) => ids.includes(d.id));
        if (selected.length > 0) {
          const hasAnyPredefined = selected.some((d) => d.hasPredefinedCards);
          if (!hasAnyPredefined) {
            loaded.deckMode = "random";
          }
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

/**
 * Re-validates selected deck IDs once dynamic decks in src/decks/ finish loading.
 */
export function syncSelectedDecksWithAvailable() {
  if (!Array.isArray(state.selectedDeckIds)) {
    state.selectedDeckIds = [AVAILABLE_DECKS[0]?.id || "original"];
  }
  const validIds = state.selectedDeckIds.filter((id) => AVAILABLE_DECKS.some((d) => d.id === id));
  if (validIds.length === 0) {
    state.selectedDeckIds = [AVAILABLE_DECKS[0]?.id || "original"];
  } else {
    state.selectedDeckIds = validIds;
  }

  const selected = AVAILABLE_DECKS.filter((d) => state.selectedDeckIds.includes(d.id));
  const hasAnyPredefined = selected.some((d) => d.hasPredefinedCards);
  if (!hasAnyPredefined) {
    state.deckMode = "random";
  }
  saveState();
}

export function saveState() {
  try {
    const serialized = JSON.stringify(state);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (_) {}
    try {
      sessionStorage.setItem(STORAGE_KEY, serialized);
    } catch (_) {}
    requestPersistentStorage();
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
