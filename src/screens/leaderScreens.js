/**
 * Leader Screens Controller
 * Handles leader privacy gate and clue writing on the 4-leaf clover.
 */
import { state, saveState, getT } from "../state.js";
import { renderCloverBoard } from "../components/boardRenderer.js";
import { getBoardEdgePairs, generateRoundCards, shuffle } from "../gameLogic.js";
import { sounds } from "../audio.js";

export function renderLeaderIntroScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  setText("txtLeaderRoundNumber", t.roundXofY(round.roundNum, round.totalRounds));
  setText("txtLeaderNameIntro", round.leaderName);
}

export function renderLeaderWritingScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  setText("txtLeaderNameBadge", round.leaderName);

  // Render clover board for leader with word previews and rotation
  const boardEl = document.getElementById("boardContainerLeader");
  renderCloverBoard(
    boardEl,
    {
      slots: round.secretBoard,
      clues: round.clues,
      showWordPreviews: true,
      canInteract: true,
      isLeaderMode: true
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
}

export function rerollLeaderCards() {
  const round = state.activeRound;
  if (!round) return;

  sounds.tap();
  const { cloverCards, fakeCard, distractorCards } = generateRoundCards(state);

  round.secretBoard = cloverCards.map((card) => ({
    card,
    rotation: Math.floor(Math.random() * 4)
  }));
  round.fakeCard = fakeCard;
  round.distractorCards = distractorCards;
  round.clues = { north: "", east: "", south: "", west: "" };

  saveState();
  renderLeaderWritingScreen();
}

export function rotateLeaderCard(cardId) {
  const round = state.activeRound;
  if (!round) return;

  sounds.rotate();
  for (let i = 0; i < 4; i++) {
    const item = round.secretBoard[i];
    if (item && item.card.id === cardId) {
      item.rotation = (item.rotation + 1) % 4;
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

  // Prepare tray: 4 secret cards plus the configured distractor cards.
  const distractors = Array.isArray(round.distractorCards)
    ? round.distractorCards
    : round.fakeCard
      ? [round.fakeCard]
      : [];
  const allCards = [
    ...round.secretBoard.map((s) => ({
      card: s.card,
      rotation: Math.floor(Math.random() * 4)
    })),
    ...distractors.map((card) => ({
      card,
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
