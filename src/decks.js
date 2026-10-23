/**
 * Deck Registry & Normalizer
 * Pure standard ECMAScript modules (100% compatible with native browser execution,
 * GitHub Pages static hosting without build steps, and Vite bundling).
 */
import originalDeck from "./decks/original.js";
import partyWordsDeck from "./decks/partyWords.js";
import cinemaDeck from "./decks/cinemaDeck.js";
import trapWordsDeck from "./decks/words.js";
import dictionary00Deck from "./decks/deck_00_dictionary_decripto_en.js";
import dictionary01Deck from "./decks/deck_01_dictionary_codenames_gagagames_ru.js";
import dictionary02Deck from "./decks/deck_02_dictionary_codenames_en.js";
import dictionary03Deck from "./decks/deck_03_dictionary_codenames_duet_en.js";
import dictionary04Deck from "./decks/deck_04_dictionary_codenames_undercover_ru.js";
import dictionary05Deck from "./decks/deck_05_dictionary_codenames_undercover_en.js";
import dictionary06Deck from "./decks/deck_06_dictionary_pard_ru.js";
import dictionary07Deck from "./decks/deck_07_dictionary_vpupkin_ru.js";
import dictionary08Deck from "./decks/deck_08_dictionary_ivanzavorin_ru.js";
import dictionary09Deck from "./decks/deck_09_dictionary_denull_ru.js";
import dictionary10Deck from "./decks/deck_10_dictionary_denull_18_ru.js";
import dictionary11Deck from "./decks/deck_11_dictionary_denull_en.js";
import dictionary12Deck from "./decks/deck_12_dictionary_denull_18_en.js";
import dictionary13Deck from "./decks/deck_13_dictionary_esperanto.js";
import dictionary14Deck from "./decks/deck_14_dictionary_doodledash_ru.js";
import dictionary15Deck from "./decks/deck_15_dictionary_justone.js";
import dictionary16Deck from "./decks/deck_16_dictionary_soclover_en.js";
import dictionary17Deck from "./decks/deck_17_dictionary_lowink_ru.js";

/**
 * Registered Decks List
 * To add a new deck: create your file in src/decks/yourDeck.js and add it to this array.
 */
export const REGISTERED_DECKS = [
  originalDeck,
  partyWordsDeck,
  cinemaDeck,
  trapWordsDeck,
  dictionary00Deck,
  dictionary01Deck,
  dictionary02Deck,
  dictionary03Deck,
  dictionary04Deck,
  dictionary05Deck,
  dictionary06Deck,
  dictionary07Deck,
  dictionary08Deck,
  dictionary09Deck,
  dictionary10Deck,
  dictionary11Deck,
  dictionary12Deck,
  dictionary13Deck,
  dictionary14Deck,
  dictionary15Deck,
  dictionary16Deck,
  dictionary17Deck
];

/**
 * Normalizes a raw deck object into a standardized format.
 */
export function normalizeDeck(raw, fallbackId = "custom") {
  if (!raw) return null;
  const id = raw.id || fallbackId;
  const hasCards = Array.isArray(raw.cards) && raw.cards.length >= 5;
  let wordPairs = [];

  if (hasCards) {
    wordPairs = raw.cards.flatMap((card) => {
      const ruWords = Array.isArray(card.ru) ? card.ru : (Array.isArray(card.words) ? card.words : []);
      const enWords = Array.isArray(card.en) ? card.en : ruWords;
      return ruWords.map((ru, idx) => ({
        ru: String(ru).trim(),
        en: String(enWords[idx] || ru).trim()
      }));
    });
  } else if (Array.isArray(raw.words)) {
    wordPairs = raw.words.map((item) => {
      if (typeof item === "string") {
        return { ru: item.trim(), en: item.trim() };
      }
      return {
        ru: String(item.ru || item.word || "").trim(),
        en: String(item.en || item.ru || item.word || "").trim()
      };
    }).filter((p) => p.ru.length > 0);
  }

  return {
    id,
    raw,
    name: raw.name || id,
    description: raw.description || "",
    hasPredefinedCards: hasCards,
    cards: hasCards ? raw.cards : [],
    wordPairs,
    cardsCount: hasCards ? raw.cards.length : Math.floor(wordPairs.length / 4),
    wordsCount: wordPairs.length
  };
}

/**
 * Loads and prepares all available decks.
 */
export function loadAllDecks() {
  const list = REGISTERED_DECKS
    .map((raw, idx) => normalizeDeck(raw, `deck-${idx + 1}`))
    .filter(Boolean);

  // Ensure 'original' deck is first if present
  list.sort((a, b) => {
    if (a.id === "original") return -1;
    if (b.id === "original") return 1;
    return a.id.localeCompare(b.id);
  });

  return list;
}

export const AVAILABLE_DECKS = loadAllDecks();

/**
 * Helper to get currently selected deck objects based on state.selectedDeckIds.
 */
export function getSelectedDecks(state) {
  const ids = Array.isArray(state?.selectedDeckIds) ? state.selectedDeckIds : [state?.selectedDeckId || "original"];
  const list = AVAILABLE_DECKS.filter((d) => ids.includes(d.id));
  return list.length > 0 ? list : [AVAILABLE_DECKS[0]];
}
