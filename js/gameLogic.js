/**
 * Mathematical Game Logic, Card Geometry & Cross-Deck Non-Repeating Word Memory
 */
import { getSelectedDecks } from "./decks.js";

export const MAX_DISTRACTOR_CARDS = 8;

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Computes the effective extra distractor cards count for the given mode.
 */
export function getEffectiveDistractorCount(state, mode = state?.gameMode) {
  const minCount = mode === "hard" ? 2 : 0;
  const raw = typeof state?.distractorCount === "number" && Number.isInteger(state.distractorCount)
    ? state.distractorCount
    : (mode === "hard" ? 2 : 1);
  return Math.max(minCount, Math.min(MAX_DISTRACTOR_CARDS, raw));
}

/**
 * Returns the word visible at physical edge (0=North, 1=East, 2=South, 3=West)
 * when card is rotated clockwise by `rotation` quarters (0, 1, 2, 3).
 */
export function getCardWordAt(card, physicalEdge, rotation, lang = "ru") {
  if (!card) return "—";
  const wordIndex = (physicalEdge - rotation + 4) % 4;
  const wordList = card[lang] || card.ru || card.en || [];
  return wordList[wordIndex] || "—";
}

/**
 * Computes the 4 outer perimeter word pairs for a 2x2 clover board:
 * [ Slot 0 (TL) ] [ Slot 1 (TR) ]
 * [ Slot 2 (BL) ] [ Slot 3 (BR) ]
 */
export function getBoardEdgePairs(slots, lang = "ru") {
  if (!slots || slots.length < 4 || !slots[0] || !slots[1] || !slots[2] || !slots[3]) {
    return { north: ["—", "—"], east: ["—", "—"], south: ["—", "—"], west: ["—", "—"] };
  }

  const s0 = slots[0];
  const s1 = slots[1];
  const s2 = slots[2];
  const s3 = slots[3];

  return {
    north: [
      getCardWordAt(s0.card, 0, s0.rotation, lang),
      getCardWordAt(s1.card, 0, s1.rotation, lang)
    ],
    east: [
      getCardWordAt(s1.card, 1, s1.rotation, lang),
      getCardWordAt(s3.card, 1, s3.rotation, lang)
    ],
    south: [
      getCardWordAt(s2.card, 2, s2.rotation, lang),
      getCardWordAt(s3.card, 2, s3.rotation, lang)
    ],
    west: [
      getCardWordAt(s0.card, 3, s0.rotation, lang),
      getCardWordAt(s2.card, 3, s2.rotation, lang)
    ]
  };
}

function ensureDeckMemory(state) {
  if (!state.usedCardIdsByDeck || typeof state.usedCardIdsByDeck !== "object") {
    state.usedCardIdsByDeck = {};
  }
  if (!state.usedWordsByDeck || typeof state.usedWordsByDeck !== "object") {
    state.usedWordsByDeck = {};
  }
  if (!Array.isArray(state.matchUsedWords)) {
    state.matchUsedWords = [];
  }
}

function getValidUsedCardSet(deck, state) {
  const raw = state?.usedCardIdsByDeck?.[deck.id];
  if (!Array.isArray(raw) || !deck.hasPredefinedCards) return new Set();
  const validIds = new Set(deck.cards.map((c) => c.id));
  const used = new Set();
  for (const id of raw) {
    if (validIds.has(id)) used.add(id);
  }
  return used;
}

function getValidUsedWordSet(deck, state) {
  const raw = state?.usedWordsByDeck?.[deck.id];
  if (!Array.isArray(raw)) return new Set();
  const max = deck.wordPairs.length;
  const used = new Set();
  for (const idx of raw) {
    if (Number.isInteger(idx) && idx >= 0 && idx < max) {
      used.add(idx);
    }
  }
  return used;
}

function normalizeWord(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function getPairKeys(pair) {
  const keys = [];
  const ru = normalizeWord(pair?.ru);
  const en = normalizeWord(pair?.en);
  if (ru) keys.push(`ru:${ru}`);
  if (en) keys.push(`en:${en}`);
  return keys;
}

function getPairPrimaryKey(pair, lang = "ru") {
  const primary = normalizeWord(lang === "en" ? (pair?.en || pair?.ru) : (pair?.ru || pair?.en));
  return primary ? `${lang}:${primary}` : "";
}

function getCardWordKeys(card, bothLangs = true, lang = "ru") {
  const keys = [];
  const ruList = Array.isArray(card?.ru) ? card.ru : [];
  const enList = Array.isArray(card?.en) ? card.en : [];
  const len = Math.max(ruList.length, enList.length);

  for (let i = 0; i < len; i++) {
    const ru = normalizeWord(ruList[i]);
    const en = normalizeWord(enList[i]);
    if (bothLangs) {
      if (ru) keys.push(`ru:${ru}`);
      if (en) keys.push(`en:${en}`);
    } else {
      const p = lang === "en" ? (en || ru) : (ru || en);
      if (p) keys.push(`${lang}:${p}`);
    }
  }
  return keys;
}

/**
 * Collects normalized keys of words already used across any of the selected decks
 * so duplicate words from different packs are automatically skipped.
 */
function buildCrossDeckUsedWordKeySet(decks, state) {
  const usedKeys = new Set();
  for (const deck of decks) {
    const usedIndices = getValidUsedWordSet(deck, state);
    for (const idx of usedIndices) {
      const pair = deck.wordPairs[idx];
      if (!pair) continue;
      for (const k of getPairKeys(pair)) {
        usedKeys.add(k);
      }
    }
    if (deck.hasPredefinedCards) {
      const usedCardIds = getValidUsedCardSet(deck, state);
      for (const card of deck.cards) {
        if (!usedCardIds.has(card.id)) continue;
        for (const k of getCardWordKeys(card, true)) {
          usedKeys.add(k);
        }
      }
    }
  }
  return usedKeys;
}

function recordWordsIntoMatchMemory(state, cards) {
  ensureDeckMemory(state);
  const existing = new Set(state.matchUsedWords);
  for (const card of cards) {
    for (const key of getCardWordKeys(card, true)) {
      existing.add(key);
    }
  }
  state.matchUsedWords = Array.from(existing);
}

/**
 * Returns remaining / used / total counts for a single deck under the current mode.
 */
export function getDeckUsageStats(deck, state, mode = state?.deckMode) {
  if (mode === "predefined" && deck.hasPredefinedCards) {
    const total = deck.cards.length;
    const used = getValidUsedCardSet(deck, state).size;
    return {
      used,
      remaining: Math.max(0, total - used),
      total,
      unit: "cards"
    };
  }

  const total = deck.wordPairs.length;
  const used = getValidUsedWordSet(deck, state).size;
  return {
    used,
    remaining: Math.max(0, total - used),
    total,
    unit: "words"
  };
}

/**
 * Summarizes remaining and used counts across all currently selected decks.
 */
export function getSelectedDecksUsageSummary(state) {
  const selectedDecks = getSelectedDecks(state);
  const hasAnyPredefined = selectedDecks.some((d) => d.hasPredefinedCards);
  const effectiveMode = !hasAnyPredefined ? "random" : state.deckMode;
  const allPredefined = effectiveMode === "predefined" && selectedDecks.every((d) => d.hasPredefinedCards);

  if (allPredefined) {
    let used = 0;
    let total = 0;
    for (const d of selectedDecks) {
      const s = getDeckUsageStats(d, state, "predefined");
      used += s.used;
      total += s.total;
    }
    const anyWordsUsed = selectedDecks.some((d) => getValidUsedWordSet(d, state).size > 0);
    return {
      used,
      remaining: Math.max(0, total - used),
      total,
      unit: "cards",
      anyUsed: used > 0 || anyWordsUsed
    };
  }

  let usedWords = 0;
  let totalWords = 0;
  let anyCardsUsed = false;

  for (const d of selectedDecks) {
    const ws = getDeckUsageStats(d, state, "random");
    usedWords += ws.used;
    totalWords += ws.total;
    if (d.hasPredefinedCards && getValidUsedCardSet(d, state).size > 0) {
      anyCardsUsed = true;
    }
  }

  return {
    used: usedWords,
    remaining: Math.max(0, totalWords - usedWords),
    total: totalWords,
    unit: "words",
    anyUsed: usedWords > 0 || anyCardsUsed
  };
}

/**
 * Resets used card & word memory for all currently selected decks.
 */
export function resetSelectedDecksHistory(state) {
  ensureDeckMemory(state);
  const selectedDecks = getSelectedDecks(state);
  for (const deck of selectedDecks) {
    delete state.usedCardIdsByDeck[deck.id];
    delete state.usedWordsByDeck[deck.id];
  }
  if (!state.activeRound) {
    state.matchUsedWords = [];
  }
}

/**
 * Draws `count` word entries `{ deckId, wordIdx, pair }` from `decks` without repeating:
 * 1) words already used in this match (across ANY deck),
 * 2) words already used in the selected packs' history,
 * 3) duplicate words within the same round.
 */
function drawUniqueWordsFromDecks(decks, state, count) {
  ensureDeckMemory(state);
  const lang = state.lang === "en" ? "en" : "ru";

  const picked = [];
  const pickedByDeck = new Map(decks.map((d) => [d.id, new Set()]));
  const roundKeysBoth = new Set();
  const roundKeysPrimary = new Set();
  const matchKeys = new Set(state.matchUsedWords);
  const crossDeckUsedKeys = buildCrossDeckUsedWordKeySet(decks, state);

  const collectEntries = (respectDeckHistory) => {
    const entries = [];
    for (const deck of decks) {
      const usedSet = respectDeckHistory ? getValidUsedWordSet(deck, state) : new Set();
      const pickedHere = pickedByDeck.get(deck.id);
      for (let i = 0; i < deck.wordPairs.length; i++) {
        if (pickedHere.has(i)) continue;
        if (respectDeckHistory && usedSet.has(i)) continue;
        entries.push({ deckId: deck.id, wordIdx: i, pair: deck.wordPairs[i] });
      }
    }
    return shuffle(entries);
  };

  const pullFromEntries = (entries, { blockMatchBoth, blockMatchPrimary, blockCrossDeck, blockRoundBoth, blockRoundPrimary }) => {
    for (const entry of entries) {
      if (picked.length >= count) break;
      const keysBoth = getPairKeys(entry.pair);
      const primaryKey = getPairPrimaryKey(entry.pair, lang);

      if (blockRoundBoth && keysBoth.some((k) => roundKeysBoth.has(k))) continue;
      if (blockRoundPrimary && primaryKey && roundKeysPrimary.has(primaryKey)) continue;
      if (blockMatchBoth && keysBoth.some((k) => matchKeys.has(k))) continue;
      if (blockMatchPrimary && primaryKey && matchKeys.has(primaryKey)) continue;
      if (blockCrossDeck && keysBoth.some((k) => crossDeckUsedKeys.has(k))) continue;

      picked.push(entry);
      pickedByDeck.get(entry.deckId).add(entry.wordIdx);
      keysBoth.forEach((k) => roundKeysBoth.add(k));
      if (primaryKey) roundKeysPrimary.add(primaryKey);
    }
  };

  // Pass 1: Strictly unused in deck + not seen in match + not already used in another selected deck
  pullFromEntries(collectEntries(true), {
    blockMatchBoth: true,
    blockMatchPrimary: true,
    blockCrossDeck: true,
    blockRoundBoth: true,
    blockRoundPrimary: true
  });

  // Pass 2: If decks ran out of unused words, reset deck history but STILL avoid repeating any word seen in this match
  if (picked.length < count) {
    for (const deck of decks) {
      state.usedWordsByDeck[deck.id] = [];
      if (deck.hasPredefinedCards) {
        state.usedCardIdsByDeck[deck.id] = [];
      }
    }
    pullFromEntries(collectEntries(false), {
      blockMatchBoth: true,
      blockMatchPrimary: true,
      blockCrossDeck: false,
      blockRoundBoth: true,
      blockRoundPrimary: true
    });
  }

  // Pass 3: Relax to active-language match uniqueness (handles bilingual translation collisions)
  if (picked.length < count) {
    pullFromEntries(collectEntries(false), {
      blockMatchBoth: false,
      blockMatchPrimary: true,
      blockCrossDeck: false,
      blockRoundBoth: false,
      blockRoundPrimary: true
    });
  }

  // Pass 4: Extreme fallback if a long match exhausted 100% of all unique words across selected packs
  if (picked.length < count) {
    state.matchUsedWords = [];
    pullFromEntries(collectEntries(false), {
      blockMatchBoth: false,
      blockMatchPrimary: false,
      blockCrossDeck: false,
      blockRoundBoth: false,
      blockRoundPrimary: true
    });
  }

  // Pass 5: Final safety fallback if total unique words in selected decks < count
  if (picked.length < count) {
    pullFromEntries(collectEntries(false), {
      blockMatchBoth: false,
      blockMatchPrimary: false,
      blockCrossDeck: false,
      blockRoundBoth: false,
      blockRoundPrimary: false
    });
  }

  // Record all picked word indices in persistent per-deck memory
  for (const entry of picked) {
    const existing = Array.isArray(state.usedWordsByDeck[entry.deckId]) ? state.usedWordsByDeck[entry.deckId] : [];
    if (!existing.includes(entry.wordIdx)) {
      existing.push(entry.wordIdx);
    }
    state.usedWordsByDeck[entry.deckId] = existing;
  }

  return picked;
}

/**
 * Generates cards for a round (4 clover cards + `distractorCount` extra trap cards)
 * while remembering used cards & words per deck and skipping cross-deck duplicate words within the match.
 */
export function generateRoundCards(state, distractorCount = null) {
  ensureDeckMemory(state);
  const lang = state.lang === "en" ? "en" : "ru";
  const selectedDecks = getSelectedDecks(state);
  const hasAnyPredefined = selectedDecks.some((d) => d.hasPredefinedCards);
  const effectiveMode = !hasAnyPredefined ? "random" : state.deckMode;
  const numDistractors = typeof distractorCount === "number"
    ? Math.max(0, Math.min(MAX_DISTRACTOR_CARDS, distractorCount))
    : getEffectiveDistractorCount(state);
  const totalCardsNeeded = 4 + numDistractors;
  const uidPrefix = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  if (effectiveMode === "predefined" && hasAnyPredefined) {
    const cardDecks = selectedDecks.filter((d) => d.hasPredefinedCards);
    const wordDecks = selectedDecks.filter((d) => !d.hasPredefinedCards);

    const chosenCards = [];
    const chosenCardIdsByDeck = new Map(cardDecks.map((d) => [d.id, new Set()]));
    const chosenWordIndicesByDeck = new Map(selectedDecks.map((d) => [d.id, new Set()]));
    const roundKeysBoth = new Set();
    const roundKeysPrimary = new Set();
    const matchKeys = new Set(state.matchUsedWords);
    const crossDeckUsedKeys = buildCrossDeckUsedWordKeySet(selectedDecks, state);

    const buildCandidates = (respectDeckHistory, { filterWordDecksAgainstMatch, filterWordDecksAgainstCrossDeck }) => {
      const candidates = [];

      // 1. Predefined 4-word cards from card decks
      for (const deck of cardDecks) {
        const usedIds = respectDeckHistory ? getValidUsedCardSet(deck, state) : new Set();
        const pickedHere = chosenCardIdsByDeck.get(deck.id);
        deck.cards.forEach((card, cardIdx) => {
          if (pickedHere.has(card.id)) return;
          if (respectDeckHistory && usedIds.has(card.id)) return;
          candidates.push({
            type: "predefined",
            deckId: deck.id,
            card,
            cardIdx
          });
        });
      }

      // 2. Dynamically formed 4-word cards from word-only decks (pre-filtering duplicate words)
      if (wordDecks.length > 0) {
        const wordEntries = [];
        const localSeenKeys = new Set(roundKeysBoth);
        for (const deck of wordDecks) {
          const usedWords = respectDeckHistory ? getValidUsedWordSet(deck, state) : new Set();
          const pickedWords = chosenWordIndicesByDeck.get(deck.id);
          for (let i = 0; i < deck.wordPairs.length; i++) {
            if (pickedWords.has(i)) continue;
            if (respectDeckHistory && usedWords.has(i)) continue;
            const pair = deck.wordPairs[i];
            const keys = getPairKeys(pair);
            if (filterWordDecksAgainstMatch && keys.some((k) => matchKeys.has(k))) continue;
            if (filterWordDecksAgainstCrossDeck && keys.some((k) => crossDeckUsedKeys.has(k))) continue;
            if (keys.some((k) => localSeenKeys.has(k))) continue;
            keys.forEach((k) => localSeenKeys.add(k));
            wordEntries.push({ deckId: deck.id, wordIdx: i, pair });
          }
        }
        const shuffledEntries = shuffle(wordEntries);
        for (let i = 0; i + 4 <= shuffledEntries.length; i += 4) {
          const chunk = shuffledEntries.slice(i, i + 4);
          candidates.push({
            type: "dynamic",
            wordEntries: chunk,
            card: {
              id: `dyn-mix-${i}-${uidPrefix}`,
              ru: chunk.map((w) => w.pair.ru),
              en: chunk.map((w) => w.pair.en)
            }
          });
        }
      }

      return shuffle(candidates);
    };

    const pickFromCandidates = (candidates, { blockMatchBoth, blockMatchPrimary, blockCrossDeck, blockRoundBoth, blockRoundPrimary }) => {
      for (const item of candidates) {
        if (chosenCards.length >= totalCardsNeeded) break;
        const keysBoth = getCardWordKeys(item.card, true, lang);
        const keysPrimary = getCardWordKeys(item.card, false, lang);

        if (blockRoundBoth) {
          if (keysBoth.some((k) => roundKeysBoth.has(k))) continue;
        }
        if (blockRoundPrimary) {
          if (new Set(keysPrimary).size < keysPrimary.length) continue;
          if (keysPrimary.some((k) => roundKeysPrimary.has(k))) continue;
        }
        if (blockMatchBoth && keysBoth.some((k) => matchKeys.has(k))) continue;
        if (blockMatchPrimary && keysPrimary.some((k) => matchKeys.has(k))) continue;
        if (blockCrossDeck && keysBoth.some((k) => crossDeckUsedKeys.has(k))) continue;

        chosenCards.push(item);
        keysBoth.forEach((k) => roundKeysBoth.add(k));
        keysPrimary.forEach((k) => roundKeysPrimary.add(k));

        if (item.type === "predefined") {
          chosenCardIdsByDeck.get(item.deckId).add(item.card.id);
          const baseIdx = item.cardIdx * 4;
          const deckWordSet = chosenWordIndicesByDeck.get(item.deckId);
          for (let k = 0; k < 4; k++) {
            deckWordSet.add(baseIdx + k);
          }
        } else {
          for (const we of item.wordEntries) {
            chosenWordIndicesByDeck.get(we.deckId).add(we.wordIdx);
          }
        }
      }
    };

    // Pass 1: Strictly unused cards/words + no match or cross-deck word repeats
    pickFromCandidates(
      buildCandidates(true, { filterWordDecksAgainstMatch: true, filterWordDecksAgainstCrossDeck: true }),
      { blockMatchBoth: true, blockMatchPrimary: true, blockCrossDeck: true, blockRoundBoth: true, blockRoundPrimary: true }
    );

    // Pass 2: Exhausted decks -> reset selected decks' history, STILL blocking words seen earlier in this match
    if (chosenCards.length < totalCardsNeeded) {
      for (const deck of selectedDecks) {
        state.usedCardIdsByDeck[deck.id] = [];
        state.usedWordsByDeck[deck.id] = [];
      }
      pickFromCandidates(
        buildCandidates(false, { filterWordDecksAgainstMatch: true, filterWordDecksAgainstCrossDeck: false }),
        { blockMatchBoth: true, blockMatchPrimary: true, blockCrossDeck: false, blockRoundBoth: true, blockRoundPrimary: true }
      );
    }

    // Pass 3: Relax to active-language match uniqueness
    if (chosenCards.length < totalCardsNeeded) {
      pickFromCandidates(
        buildCandidates(false, { filterWordDecksAgainstMatch: false, filterWordDecksAgainstCrossDeck: false }),
        { blockMatchBoth: false, blockMatchPrimary: true, blockCrossDeck: false, blockRoundBoth: false, blockRoundPrimary: true }
      );
    }

    // Pass 4: Extreme fallback if entire pool was exhausted in one match
    if (chosenCards.length < totalCardsNeeded) {
      state.matchUsedWords = [];
      pickFromCandidates(
        buildCandidates(false, { filterWordDecksAgainstMatch: false, filterWordDecksAgainstCrossDeck: false }),
        { blockMatchBoth: false, blockMatchPrimary: false, blockCrossDeck: false, blockRoundBoth: false, blockRoundPrimary: true }
      );
    }

    // Pass 5: Final safety fallback
    if (chosenCards.length < totalCardsNeeded) {
      pickFromCandidates(
        buildCandidates(false, { filterWordDecksAgainstMatch: false, filterWordDecksAgainstCrossDeck: false }),
        { blockMatchBoth: false, blockMatchPrimary: false, blockCrossDeck: false, blockRoundBoth: false, blockRoundPrimary: false }
      );
    }

    // Persist drawn cards & words to deck history
    for (const item of chosenCards) {
      if (item.type === "predefined") {
        const list = Array.isArray(state.usedCardIdsByDeck[item.deckId]) ? state.usedCardIdsByDeck[item.deckId] : [];
        if (!list.includes(item.card.id)) list.push(item.card.id);
        state.usedCardIdsByDeck[item.deckId] = list;

        const wList = Array.isArray(state.usedWordsByDeck[item.deckId]) ? state.usedWordsByDeck[item.deckId] : [];
        const baseIdx = item.cardIdx * 4;
        for (let k = 0; k < 4; k++) {
          if (!wList.includes(baseIdx + k)) wList.push(baseIdx + k);
        }
        state.usedWordsByDeck[item.deckId] = wList;
      } else {
        for (const we of item.wordEntries) {
          const wList = Array.isArray(state.usedWordsByDeck[we.deckId]) ? state.usedWordsByDeck[we.deckId] : [];
          if (!wList.includes(we.wordIdx)) wList.push(we.wordIdx);
          state.usedWordsByDeck[we.deckId] = wList;
        }
      }
    }

    const cards = chosenCards.map((c) => c.card);
    recordWordsIntoMatchMemory(state, cards);

    const fakeCards = cards.slice(4, totalCardsNeeded);
    return {
      cloverCards: cards.slice(0, 4),
      fakeCards,
      fakeCard: fakeCards[0] || null
    };
  } else {
    // Mode 'random': draw unique unused words across selected decks and build 4-word cards
    const totalWordsNeeded = totalCardsNeeded * 4;
    const chosenEntries = drawUniqueWordsFromDecks(selectedDecks, state, totalWordsNeeded);

    const generated = [];
    for (let c = 0; c < totalCardsNeeded; c++) {
      const slice = chosenEntries.slice(c * 4, c * 4 + 4);
      generated.push({
        id: `rnd-mix-${c + 1}-${uidPrefix}`,
        ru: slice.map((e) => e.pair.ru),
        en: slice.map((e) => e.pair.en)
      });
    }

    recordWordsIntoMatchMemory(state, generated);

    const fakeCards = generated.slice(4, totalCardsNeeded);
    return {
      cloverCards: generated.slice(0, 4),
      fakeCards,
      fakeCard: fakeCards[0] || null
    };
  }
}
