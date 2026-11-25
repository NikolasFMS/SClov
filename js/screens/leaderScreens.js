/**
 * Leader Screens Controller
 * Handles leader privacy gate and clue writing on the 4-leaf clover.
 */
import { state, saveState, getT } from "../state.js";
import { renderCloverBoard } from "../components/boardRenderer.js";
import { getBoardEdgePairs, generateRoundCards, getEffectiveDistractorCount, shuffle } from "../gameLogic.js";
import { sounds } from "../audio.js";
import { haptics } from "../haptics.js";
import { sandTimer } from "../timer.js";

let lastRotatedLeaderCardId = null;
let lastLeaderCardTap = { cardId: null, time: 0 };

function formatHearts(lives, maxLives) {
  const filled = Math.max(0, Math.min(maxLives, lives));
  return "❤️".repeat(filled) + "🖤".repeat(Math.max(0, maxLives - filled));
}

export function renderLeaderIntroScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  const isMarathon = round.gameMode === "marathon";
  setText(
    "txtLeaderRoundNumber",
    isMarathon ? t.roundMarathonNum(round.roundNum) : t.roundXofY(round.roundNum, round.totalRounds)
  );
  setText("txtLeaderNameIntro", round.leaderName);

  const modeStatusEl = document.getElementById("txtLeaderModeStatus");
  if (modeStatusEl) {
    modeStatusEl.className = "mode-status-pill";
    if (round.gameMode === "marathon") {
      modeStatusEl.textContent = `${t.marathonLivesLabel}: ${formatHearts(state.marathonLives, state.marathonMaxLives)}`;
      modeStatusEl.classList.add("mode-status-pill--marathon");
      modeStatusEl.style.display = "inline-flex";
    } else if (round.gameMode === "blitz") {
      const rem = typeof state.blitzRemainingSeconds === "number" ? state.blitzRemainingSeconds : state.blitzDuration;
      modeStatusEl.textContent = `⚡ ${t.blitzBankLabel}: ${sandTimer.formatTime(rem)}`;
      modeStatusEl.classList.add("mode-status-pill--blitz");
      modeStatusEl.style.display = "inline-flex";
    } else if (round.gameMode === "hard") {
      const traps = typeof round.distractorCount === "number" ? round.distractorCount : getEffectiveDistractorCount(state, "hard");
      modeStatusEl.textContent = `🔥 ${t.gameModeHardTitle} · +${traps}`;
      modeStatusEl.classList.add("mode-status-pill--hard");
      modeStatusEl.style.display = "inline-flex";
    } else {
      modeStatusEl.style.display = "none";
    }
  }
}

export function renderLeaderWritingScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  setText("txtLeaderNameBadge", round.leaderName);

  // Render clover board for leader with word previews and rotation
  const boardEl = document.getElementById("boardContainerLeader");
  const rotatedId = lastRotatedLeaderCardId;
  lastRotatedLeaderCardId = null;

  renderCloverBoard(
    boardEl,
    {
      slots: round.secretBoard,
      clues: round.clues,
      showWordPreviews: true,
      canInteract: true,
      isLeaderMode: true,
      justRotatedCardId: rotatedId
    },
    state
  );

  // Edge previews in clue input cards
  const pairs = getBoardEdgePairs(round.secretBoard, state.lang);
  setText("previewWordsNorth", `${pairs.north[0]} + ${pairs.north[1]}`);
  setText("previewWordsEast", `${pairs.east[0]} + ${pairs.east[1]}`);
  setText("previewWordsSouth", `${pairs.south[0]} + ${pairs.south[1]}`);
  setText("previewWordsWest", `${pairs.west[0]} + ${pairs.west[1]}`);

  // Populate inputs with current clues
  const inN = document.getElementById("inputClueNorth");
  const inE = document.getElementById("inputClueEast");
  const inS = document.getElementById("inputClueSouth");
  const inW = document.getElementById("inputClueWest");

  if (inN) inN.value = round.clues.north || "";
  if (inE) inE.value = round.clues.east || "";
  if (inS) inS.value = round.clues.south || "";
  if (inW) inW.value = round.clues.west || "";

  validateLeaderInputs();
}

export function validateLeaderInputs() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  const inN = document.getElementById("inputClueNorth")?.value.trim() || "";
  const inE = document.getElementById("inputClueEast")?.value.trim() || "";
  const inS = document.getElementById("inputClueSouth")?.value.trim() || "";
  const inW = document.getElementById("inputClueWest")?.value.trim() || "";

  round.clues.north = inN;
  round.clues.east = inE;
  round.clues.south = inS;
  round.clues.west = inW;

  const filledCount = [inN, inE, inS, inW].filter(Boolean).length;
  setText("txtCluesCountBadge", `${filledCount} / 4`);

  const btnFinish = document.getElementById("btnFinishLeaderTurn");
  const txtReady = document.getElementById("txtCloverReadyBtn");

  if (filledCount === 4) {
    if (btnFinish) btnFinish.disabled = false;
    if (txtReady) txtReady.textContent = t.btnReadyPassTurn;
  } else {
    if (btnFinish) btnFinish.disabled = true;
    if (txtReady) txtReady.textContent = t.btnFillAllClues;
  }

  saveState();
}

export function rerollLeaderCards() {
  const round = state.activeRound;
  if (!round) return;

  sounds.tap();
  haptics.tap();
  const distractorCount =
    typeof round.distractorCount === "number"
      ? round.distractorCount
      : getEffectiveDistractorCount(state, round.gameMode);
  const { cloverCards, fakeCards, fakeCard } = generateRoundCards(state, distractorCount);

  round.secretBoard = cloverCards.map((card) => ({
    card,
    rotation: Math.floor(Math.random() * 4)
  }));
  round.distractorCount = distractorCount;
  round.fakeCards = fakeCards;
  round.fakeCard = fakeCard;
  round.clues = { north: "", east: "", south: "", west: "" };

  saveState();
  renderLeaderWritingScreen();
}

export function handleLeaderCardTap(cardId) {
  if (!cardId) return;
  const now = Date.now();
  if (lastLeaderCardTap.cardId === cardId && now - lastLeaderCardTap.time < 320) {
    lastLeaderCardTap = { cardId: null, time: 0 };
    rotateLeaderCard(cardId);
  } else {
    lastLeaderCardTap = { cardId, time: now };
  }
}

export function rotateLeaderCard(cardId) {
  const round = state.activeRound;
  if (!round) return;

  sounds.rotate();
  haptics.rotate();
  for (let i = 0; i < 4; i++) {
    const item = round.secretBoard[i];
    if (item && item.card.id === cardId) {
      item.rotation = (item.rotation + 1) % 4;
      lastRotatedLeaderCardId = cardId;
      saveState();
      renderLeaderWritingScreen();
      return;
    }
  }
}

export function finishLeaderWriting(onComplete) {
  const round = state.activeRound;
  if (!round) return;

  sounds.tap();
  haptics.tap();

  // Prepare tray: 4 secret cards (random rotation) + 1 or 2 fake distractor cards
  const fakeList =
    Array.isArray(round.fakeCards) && round.fakeCards.length > 0
      ? round.fakeCards
      : round.fakeCard
        ? [round.fakeCard]
        : [];

  const allCards = [
    ...round.secretBoard.map((s) => ({
      card: s.card,
      rotation: Math.floor(Math.random() * 4)
    })),
    ...fakeList.map((fc) => ({
      card: fc,
      rotation: Math.floor(Math.random() * 4)
    }))
  ];

  round.trayCards = shuffle(allCards);
  round.teamBoard = [null, null, null, null];
  round.selectedTrayCardId = null;
  round.attempt = 1;

  saveState();
  if (typeof onComplete === "function") {
    onComplete();
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
