/**
 * Summary and Game Over Screens Controller
 * Displays round scores, original clover vs team guess toggle, rank achievements, and match chronology.
 */
import { state, saveState, getT } from "../state.js";
import { renderCloverBoard } from "../components/boardRenderer.js";
import { renderCardHtml, escapeHtml } from "../components/cardRenderer.js";
import { sounds } from "../audio.js";

export function renderSummaryScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  setText("txtSummaryRoundTitle", t.summaryRoundTitle(round.roundNum));
  setText("txtSumLeaderName", round.leaderName);
  setText("txtSumRoundPts", `+${round.lastRoundPoints}`);
  setText("txtSumTotalScore", state.totalScore);

  if (round.wasFirstAttemptSuccess) {
    setText("txtSumBanner", t.bannerAttempt1);
  } else {
    setText("txtSumBanner", t.bannerAttempt2(round.lastRoundPoints));
  }

  // Toggle buttons
  const btnSecret = document.getElementById("btnToggleSecretView");
  const btnTeam = document.getElementById("btnToggleTeamView");
  if (btnSecret && btnTeam) {
    btnSecret.classList.toggle("active", round.summaryViewMode === "secret");
    btnTeam.classList.toggle("active", round.summaryViewMode === "team");
  }

  // Board display
  const boardEl = document.getElementById("boardContainerSummary");
  const slotsToDisplay = round.summaryViewMode === "secret" ? round.secretBoard : round.teamBoard;

  renderCloverBoard(
    boardEl,
    {
      slots: slotsToDisplay,
      clues: round.clues,
      showWordPreviews: true,
      canInteract: false,
      isLeaderMode: true
    },
    state
  );

  // Distractor fake card display
  const fakeEl = document.getElementById("fakeCardContainer");
  if (fakeEl && round.fakeCard) {
    fakeEl.innerHTML = renderCardHtml(
      round.fakeCard,
      0,
      {
        isLocked: false,
        canRotate: false,
        isDraggable: false
      },
      state.lang
    );
  }

  // Next round / Finish button text
  const isLastRound = state.currentRoundIndex >= round.totalRounds - 1;
  setText("txtNextRoundBtn", isLastRound ? t.btnFinishGame : t.btnNextRound);
}

export function renderGameOverScreen() {
  const t = getT();
  setText("txtFinalScoreValue", state.totalScore);

  // Score rank evaluation
  let badge = t.rank1;
  let desc = t.rank1Desc;
  if (state.totalScore >= 18) {
    badge = t.rank4;
    desc = t.rank4Desc;
  } else if (state.totalScore >= 12) {
    badge = t.rank3;
    desc = t.rank3Desc;
  } else if (state.totalScore >= 6) {
    badge = t.rank2;
    desc = t.rank2Desc;
  }

  setText("txtFinalRankBadge", badge);
  setText("txtFinalRankDesc", desc);

  // Chronology list
  const listEl = document.getElementById("chronologyList");
  if (listEl) {
    listEl.innerHTML = state.roundHistory
      .map(
        (rh, idx) => `
        <div style="background: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
          <div>
            <span style="color: #f59e0b; font-weight: 800;">Клевер ${idx + 1}</span> • <strong>${escapeHtml(rh.leader)}</strong>
            <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
              ${escapeHtml(rh.clues.north)} | ${escapeHtml(rh.clues.east)} | ${escapeHtml(rh.clues.south)} | ${escapeHtml(rh.clues.west)}
            </div>
          </div>
          <div style="font-size: 16px; font-weight: 900; color: #4ade80;">+${rh.points}</div>
        </div>
      `
      )
      .join("");
  }
}

export function renderRulesContent() {
  const isRu = state.lang === "ru";
  const contentEl = document.getElementById("txtRulesModalContent");
  if (!contentEl) return;

  if (isRu) {
    contentEl.innerHTML = `
      <p style="margin-bottom: 10px;"><strong>Удачные слова (So Clover!)</strong> — кооперативная настольная игра на ассоциации и дедукцию для любой компании.</p>
      
      <h4 style="color: #4ade80; margin: 12px 0 4px; font-size: 14px;">1. Роль ведущего</h4>
      <p style="margin-bottom: 8px;">Игроки по очереди становятся ведущими. Ведущий получает клевер с 4 случайными картами. На четырёх внешних сторонах клевера образуются 4 пары слов (Север, Восток, Юг, Запад). Ведущий тайно придумывает и записывает ровно одно слово-намёк для каждой пары.</p>
      
      <h4 style="color: #4ade80; margin: 12px 0 4px; font-size: 14px;">2. Ловушка и ход команды</h4>
      <p style="margin-bottom: 8px;">После записи намёков 4 карты снимаются с клевера, перемешиваются с 5-й картой-ловушкой (дистрактором) и передаются команде. Ведущий молчит!</p>
      
      <h4 style="color: #4ade80; margin: 12px 0 4px; font-size: 14px;">3. Отгадывание и подсчёт очков</h4>
      <ul style="padding-left: 20px; margin-bottom: 10px; line-height: 1.6;">
        <li><strong>Попытка 1:</strong> Команда перетаскивает или раскладывает и поворачивает карты. Если все 4 карты угаданы верно — <strong>6 очков</strong> (5 + 1 бонус)!</li>
        <li><strong>Попытка 2:</strong> Если есть ошибки, правильные карты фиксируются на клевере. Неверные возвращаются в лоток. На второй попытке команда получает по <strong>1 очку</strong> за каждую правильную карту.</li>
      </ul>
      <p>Цель — набрать как можно больше очков за всю игру!</p>
    `;
  } else {
    contentEl.innerHTML = `
      <p style="margin-bottom: 10px;"><strong>So Clover!</strong> is a cooperative word association party game for players of any group size.</p>
      
      <h4 style="color: #4ade80; margin: 12px 0 4px; font-size: 14px;">1. The Leader's Turn</h4>
      <p style="margin-bottom: 8px;">Players take turns being the Leader. The leader gets a 4-leaf clover board with 4 cards. 4 pairs of adjacent words are formed along the outer edges (North, East, South, West). The leader secretly writes one association clue for each word pair.</p>
      
      <h4 style="color: #4ade80; margin: 12px 0 4px; font-size: 14px;">2. The Distractor & Team Turn</h4>
      <p style="margin-bottom: 8px;">The cards are removed, shuffled with a 5th fake distractor card, and handed to the detective team. The leader must remain silent!</p>
      
      <h4 style="color: #4ade80; margin: 12px 0 4px; font-size: 14px;">3. Guessing & Scoring</h4>
      <ul style="padding-left: 20px; margin-bottom: 10px; line-height: 1.6;">
        <li><strong>Attempt 1:</strong> Drag or place cards. If the team correctly places and rotates all 4 cards: <strong>6 points</strong> (5 + 1 bonus)!</li>
        <li><strong>Attempt 2:</strong> If there are errors, correct cards stay locked on the clover; wrong cards return to the tray. The team gets <strong>1 point</strong> per correct card on Attempt 2.</li>
      </ul>
      <p>Aim for the highest master rating together!</p>
    `;
  }
}

export function handleNextRoundOrFinish(onNextRound, onGameOver) {
  const round = state.activeRound;
  if (!round) return;

  sounds.tap();

  // Save round to history
  state.roundHistory.push({
    leader: round.leaderName,
    points: round.lastRoundPoints,
    clues: { ...round.clues }
  });

  const nextIndex = state.currentRoundIndex + 1;
  if (nextIndex < round.totalRounds) {
    if (typeof onNextRound === "function") onNextRound(nextIndex);
  } else {
    sounds.fanfare();
    saveState();
    if (typeof onGameOver === "function") onGameOver();
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
