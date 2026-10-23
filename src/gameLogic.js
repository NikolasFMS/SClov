/**
 * Mathematical Game Logic & Card Geometry for 4-Leaf Clover
 */
import { getSelectedDecks } from "./decks.js";

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

/**
 * Generates four target cards plus the configured number of distractor cards.
 */
export function generateRoundCards(state) {
  const selectedDecks = getSelectedDecks(state);
  const hasAnyPredefined = selectedDecks.some((d) => d.hasPredefinedCards);
  const effectiveMode = !hasAnyPredefined ? "random" : state.deckMode;
  const distractorCount = Number.isInteger(Number(state.distractorCardCount))
    ? Math.min(6, Math.max(1, Number(state.distractorCardCount)))
    : Number.isInteger(Number(state.guessingCardCount))
      ? Math.min(6, Math.max(1, Number(state.guessingCardCount) - 4))
      : 1;
  const trayCardCount = 4 + distractorCount;

  if (effectiveMode === "predefined" && hasAnyPredefined) {
    // Pick the four target cards plus the configured number of distractors.
    const readyCards = selectedDecks
      .filter((d) => d.hasPredefinedCards)
      .flatMap((d) => d.cards);

    // Dynamically form 4-word cards for word-only decks selected alongside card decks.
    const wordDecks = selectedDecks.filter((d) => !d.hasPredefinedCards);
    const dynamicCards = [];
    if (wordDecks.length > 0) {
      const wordPool = shuffle(wordDecks.flatMap((d) => d.wordPairs));
      for (let i = 0; i + 4 <= wordPool.length; i += 4) {
        const chunk = wordPool.slice(i, i + 4);
        dynamicCards.push({
          id: `dyn-mix-${i}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          ru: chunk.map((w) => w.ru),
          en: chunk.map((w) => w.en)
        });
      }
    }

    const fullPool = shuffle([...readyCards, ...dynamicCards]);
    const chosen = fullPool.slice(0, trayCardCount);
    while (chosen.length < trayCardCount && fullPool.length > 0) {
      const source = fullPool[chosen.length % fullPool.length];
      chosen.push({ ...source, id: `${source.id}-copy-${chosen.length}` });
    }

    const distractorCards = chosen.slice(4);
    return {
      cloverCards: chosen.slice(0, 4),
      distractorCards,
      fakeCard: distractorCards[0] || null
    };
  }

  // Random mode: generate enough 4-word cards to fill the configured tray.
  const allWords = shuffle(selectedDecks.flatMap((d) => d.wordPairs));
  const requiredWords = trayCardCount * 4;
  const chosenPairs = allWords.slice(0, requiredWords);
  while (chosenPairs.length < requiredWords && allWords.length > 0) {
    chosenPairs.push(...shuffle(allWords).slice(0, requiredWords - chosenPairs.length));
  }

  const generated = [];
  for (let c = 0; c < trayCardCount; c++) {
    const slice = chosenPairs.slice(c * 4, c * 4 + 4);
    generated.push({
      id: `rnd-mix-${c + 1}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      ru: slice.map((p) => p.ru),
      en: slice.map((p) => p.en)
    });
  }

  const distractorCards = generated.slice(4);
  return {
    cloverCards: generated.slice(0, 4),
    distractorCards,
    fakeCard: distractorCards[0] || null
  };
}
