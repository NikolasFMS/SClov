/**
 * Summary and Game Over Screens Controller
 * Displays round scores, original clover vs team guess toggle, rank achievements, and match chronology.
 */
import { state, saveState, getT } from "../state.js";
import { renderCloverBoard } from "../components/boardRenderer.js";
import { renderCardHtml, escapeHtml } from "../components/cardRenderer.js";
import { sounds } from "../audio.js";
import { haptics } from "../haptics.js";
import { sandTimer } from "../timer.js";

import { getEffectiveDistractorCount } from "../gameLogic.js";

function formatHearts(lives, maxLives) {
  const filled = Math.max(0, Math.min(maxLives, lives));
  return "❤️".repeat(filled) + "🖤".repeat(Math.max(0, maxLives - filled));
}

export function recordActiveRoundToHistory() {
  const round = state.activeRound;
  if (!round) return;

  const alreadyRecorded = state.roundHistory.some((h) => h.roundNum === round.roundNum);
  if (!alreadyRecorded) {
    const traps = Array.isArray(round.fakeCards)
      ? round.fakeCards.length
      : typeof round.distractorCount === "number"
        ? round.distractorCount
        : round.gameMode === "hard"
          ? 2
          : 1;
    const maxPoints = round.gameMode === "hard" ? 6 + Math.max(1, traps - 1) : 6;
    state.roundHistory.push({
      roundNum: round.roundNum,
      leader: round.leaderName,
      points: round.lastRoundPoints,
      maxPoints,
      distractorCount: traps,
      lostLife: Boolean(round.lostLife),
      clues: { ...round.clues }
    });
    saveState();
  }
}

export function renderSummaryScreen() {
  const t = getT();
  const round = state.activeRound;
  if (!round) return;

  const isMarathon = round.gameMode === "marathon";
  setText(
    "txtSummaryRoundTitle",
    isMarathon ? t.summaryMarathonTitle(round.roundNum) : t.summaryRoundTitle(round.roundNum)
  );
  setText("txtSumLeaderName", round.leaderName);
  setText("txtSumRoundPts", `+${round.lastRoundPoints}`);
  setText("txtSumTotalScore", state.totalScore);

  // Marathon lives pill on summary
  const livesBadge = document.getElementById("txtSummaryLivesBadge");
  if (livesBadge) {
    if (isMarathon) {
      livesBadge.textContent = `${t.marathonLivesLabel}: ${formatHearts(state.marathonLives, state.marathonMaxLives)}`;
      livesBadge.className = "mode-status-pill mode-status-pill--marathon";
      livesBadge.style.display = "inline-flex";
    } else if (round.gameMode === "blitz") {
      const rem = typeof state.blitzRemainingSeconds === "number" ? state.blitzRemainingSeconds : 0;
      livesBadge.textContent = `⚡ ${t.blitzBankLabel}: ${sandTimer.formatTime(rem)}`;
      livesBadge.className = "mode-status-pill mode-status-pill--blitz";
      livesBadge.style.display = "inline-flex";
    } else {
      livesBadge.style.display = "none";
    }
  }

  // Banner message
  const bannerEl = document.getElementById("txtSumBanner");
  let bannerText = "";
  if (round.wasFirstAttemptSuccess) {
    if (round.gameMode === "hard") {
      const traps = Array.isArray(round.fakeCards) ? round.fakeCards.length : (round.distractorCount ?? 2);
      const bonus = round.hardBonus || Math.max(1, traps - 1);
      bannerText = t.bannerAttempt1Hard(round.lastRoundPoints || 6 + bonus, bonus);
    } else if (round.gameMode === "blitz") {
      bannerText = t.bannerAttempt1Blitz;
    } else if (isMarathon) {
      bannerText = t.bannerMarathonSafe(round.lastRoundPoints, state.marathonLives);
    } else {
      bannerText = t.bannerAttempt1;
    }
  } else if (isMarathon) {
    bannerText = round.lostLife
      ? t.bannerMarathonLostLife(round.lastRoundPoints, state.marathonLives)
      : t.bannerMarathonSafe(round.lastRoundPoints, state.marathonLives);
  } else {
    bannerText = t.bannerAttempt2(round.lastRoundPoints);
  }
  if (bannerEl) {
    bannerEl.textContent = bannerText;
    bannerEl.classList.toggle("summary-banner--danger", Boolean(round.lostLife));
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

  // Distractor fake card(s) display (hidden cleanly if 0 extra cards were selected)
  const fakeList = Array.isArray(round.fakeCards)
    ? round.fakeCards
    : round.fakeCard
      ? [round.fakeCard]
      : [];
  const fakeBoxEl = document.getElementById("fakeCardBox");
  const fakeEl = document.getElementById("fakeCardContainer");

  if (fakeList.length === 0) {
    if (fakeBoxEl) fakeBoxEl.style.display = "none";
    if (fakeEl) fakeEl.innerHTML = "";
  } else {
    const isMultiFake = fakeList.length > 1;
    setText("txtFakeCardLabel", isMultiFake ? t.fakeCardLabelMulti(fakeList.length) : t.fakeCardLabel);

    if (fakeBoxEl) {
      fakeBoxEl.style.display = "flex";
      fakeBoxEl.classList.toggle("fake-card-box--dual", isMultiFake);
    }

    if (fakeEl) {
      fakeEl.classList.toggle("dual-fake-cards", isMultiFake);
      fakeEl.innerHTML = fakeList
        .map((fc) =>
          renderCardHtml(
            fc,
            0,
            {
              isLocked: false,
              canRotate: false,
              isDraggable: false
            },
            state.lang
          )
        )
        .join("");
    }
  }

  // Next round / Finish / Stop Marathon buttons
  const btnStopMarathon = document.getElementById("btnStopMarathon");
  setText("txtStopMarathonBtn", t.btnStopMarathon);

  if (isMarathon) {
    if (state.marathonLives > 0) {
      setText("txtNextRoundBtn", t.btnNextMarathonClover);
      if (btnStopMarathon) btnStopMarathon.style.display = "flex";
    } else {
      setText("txtNextRoundBtn", t.btnFinishMarathon);
      if (btnStopMarathon) btnStopMarathon.style.display = "none";
    }
  } else {
    if (btnStopMarathon) btnStopMarathon.style.display = "none";
    const isLastRound = state.currentRoundIndex >= round.totalRounds - 1;
    setText("txtNextRoundBtn", isLastRound ? t.btnFinishGame : t.btnNextRound);
  }
}

export function renderGameOverScreen() {
  const t = getT();
  setText("txtFinalScoreValue", state.totalScore);

  // Persist Marathon personal record
  if (state.gameMode === "marathon" && state.roundHistory.length > state.bestMarathonClovers) {
    state.bestMarathonClovers = state.roundHistory.length;
    saveState();
  }

  // Title & icon based on mode
  const iconEl = document.getElementById("iconGameOver");
  if (state.gameMode === "blitz" && state.blitzTimedOut) {
    if (iconEl) iconEl.textContent = "⏰";
    setText("txtGameOverTitle", t.gameOverBlitzTimeUpTitle);
  } else if (state.gameMode === "marathon") {
    if (iconEl) iconEl.textContent = state.marathonLives > 0 ? "🏆" : "❤️‍🔥";
    setText("txtGameOverTitle", t.gameOverMarathonTitle);
  } else {
    if (iconEl) iconEl.textContent = "🏆";
    setText("txtGameOverTitle", t.gameOverTitle);
  }

  // Mode meta subtitle
  const metaEl = document.getElementById("txtGameOverModeMeta");
  if (metaEl) {
    if (state.gameMode === "hard") {
      const traps = state.roundHistory[0]?.distractorCount ?? getEffectiveDistractorCount(state, "hard");
      metaEl.textContent = t.gameOverHardMeta(traps);
      metaEl.style.display = "inline-flex";
    } else if (state.gameMode === "blitz") {
      metaEl.textContent = state.blitzTimedOut
        ? t.gameOverBlitzExpiredMeta
        : t.gameOverBlitzLeftMeta(sandTimer.formatTime(state.blitzRemainingSeconds ?? 0));
      metaEl.style.display = "inline-flex";
    } else if (state.gameMode === "marathon") {
      metaEl.textContent = t.gameOverMarathonMeta(state.roundHistory.length, state.bestMarathonClovers);
      metaEl.style.display = "inline-flex";
    } else {
      metaEl.style.display = "none";
    }
  }

  // Dynamic ratio-based score rank evaluation (scales cleanly with player count, Hard bonus, and Marathon length)
  const fallbackMax = state.gameMode === "hard" ? 6 + Math.max(1, getEffectiveDistractorCount(state, "hard") - 1) : 6;
  const maxTotalScore =
    state.roundHistory.length > 0
      ? state.roundHistory.reduce((sum, rh) => sum + (rh.maxPoints || fallbackMax), 0)
      : fallbackMax;
  const ratio = state.totalScore / Math.max(1, maxTotalScore);

  let badge = t.rank1;
  let desc = t.rank1Desc;
  if (ratio >= 0.85 && state.totalScore > 0) {
    badge = t.rank4;
    desc = t.rank4Desc;
  } else if (ratio >= 0.65 && state.totalScore > 0) {
    badge = t.rank3;
    desc = t.rank3Desc;
  } else if (ratio >= 0.4 && state.totalScore > 0) {
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
        <div class="chronology-row">
          <div>
            <span class="chronology-round">${escapeHtml(t.chronologyClover(idx + 1))}</span> • <strong>${escapeHtml(rh.leader)}</strong>${rh.lostLife ? " 💔" : ""}
            <div class="chronology-clues">
              ${escapeHtml(rh.clues.north)} | ${escapeHtml(rh.clues.east)} | ${escapeHtml(rh.clues.south)} | ${escapeHtml(rh.clues.west)}
            </div>
          </div>
          <div class="chronology-pts">+${rh.points}</div>
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
      <p style="margin-bottom: 10px;"><strong>Удачные слова (So Clover!)</strong> — кооперативная игра на ассоциации и дедукцию для любой компании.</p>
      
      <h4 class="rules-heading">1. Ход ведущего</h4>
      <p style="margin-bottom: 8px;">Игроки по очереди становятся ведущими. Ведущий получает клевер с 4 картами, образующими 4 пары слов по внешним сторонам (Север, Восток, Юг, Запад), и тайно записывает по одному слову-намёку для каждой пары.</p>
      
      <h4 class="rules-heading">2. Дополнительные карты (ловушки) и ход команды</h4>
      <p style="margin-bottom: 8px;">4 карты снимаются с клевера и перемешиваются с дополнительными картами-ловушками (по умолчанию 1, но в настройках можно выбрать от 0 до 8 дополнительных карт). Ведущий молчит, пока команда восстанавливает раскладку.</p>
      
      <h4 class="rules-heading">3. Отгадывание и подсчёт очков</h4>
      <ul style="padding-left: 20px; margin-bottom: 10px; line-height: 1.6;">
        <li><strong>Попытка 1:</strong> Команда раскладывает и поворачивает карты. Если все 4 карты на своих местах и повёрнуты верно — <strong>6 очков</strong> (4 за карты + 2 бонусных)!</li>
        <li><strong>Попытка 2:</strong> Если есть ошибки, верные карты фиксируются на клевере, а неверные возвращаются в лоток. Со второй попытки даётся по <strong>1 очку</strong> за каждую верную карту (0–4 очка).</li>
      </ul>

      <h4 class="rules-heading">4. Режимы игры</h4>
      <ul style="padding-left: 20px; margin-bottom: 10px; line-height: 1.6;">
        <li><strong>🍀 Классика:</strong> Фиксированное число клеверов на игрока (1 или 2), 2 попытки, до 6 очков за клевер. Можно настроить песочный таймер на ход команды или отключить его.</li>
        <li><strong>🔥 Сложный режим:</strong> В лоток добавляется от <strong>2 до 8 карт-ловушек</strong>. За разгадку с 1-й попытки начисляется бонус сложности: <strong>+1 очко за каждую доп. ловушку сверх первой</strong> (7 очков при 2 ловушках, 8 при 3 и т.д.).</li>
        <li><strong>⚡ Блиц-партия:</strong> Один общий банк времени на всю партию (5–15 минут). Таймер идёт только на этапе отгадывания; каждая разгадка с 1-й попытки добавляет <strong>+30 секунд</strong>. Когда время истекает, засчитываются очки за верно стоящие карты на поле.</li>
        <li><strong>❤️ Марафон:</strong> Бесконечная серия клеверов и <strong>3 жизни</strong>. Если за клевер набрано меньше 3 очков — сгорает 1 жизнь. Игра идёт до последней жизни или добровольного завершения.</li>
      </ul>

      <h4 class="rules-heading">5. Колоды и неповторяющиеся слова</h4>
      <p>Можно смешивать сразу несколько колод и словарей. Игра запоминает использованные карты и слова и автоматически пропускает повторы из разных колод в пределах партии.</p>
    `;
  } else {
    contentEl.innerHTML = `
      <p style="margin-bottom: 10px;"><strong>So Clover!</strong> is a cooperative word association party game for any group size.</p>
      
      <h4 class="rules-heading">1. The Leader's Turn</h4>
      <p style="margin-bottom: 8px;">Players take turns being the Leader. The leader gets a 4-leaf clover with 4 cards forming 4 outer word pairs (North, East, South, West) and secretly writes one association clue for each pair.</p>
      
      <h4 class="rules-heading">2. Extra Distractor Cards & Team Turn</h4>
      <p style="margin-bottom: 8px;">The 4 cards are removed and shuffled with extra distractor cards (1 by default, customizable from 0 to 8 in setup). The leader stays silent while the team reconstructs the clover.</p>
      
      <h4 class="rules-heading">3. Guessing & Scoring</h4>
      <ul style="padding-left: 20px; margin-bottom: 10px; line-height: 1.6;">
        <li><strong>Attempt 1:</strong> Place and rotate cards on the clover. Getting all 4 right on the first try awards <strong>6 points</strong> (4 for cards + 2 bonus)!</li>
        <li><strong>Attempt 2:</strong> Correct cards lock in place; incorrect ones return to the tray. On Attempt 2, the team earns <strong>1 point</strong> per correct card (0–4 pts).</li>
      </ul>

      <h4 class="rules-heading">4. Game Modes</h4>
      <ul style="padding-left: 20px; margin-bottom: 10px; line-height: 1.6;">
        <li><strong>🍀 Classic:</strong> Fixed clovers per player (1 or 2), 2 attempts, up to 6 points per clover, with an optional per-turn sand timer.</li>
        <li><strong>🔥 Hard Mode:</strong> Uses <strong>2 to 8 distractor cards</strong>. Solving on Attempt 1 awards a scaling difficulty bonus: <strong>+1 point for each extra trap beyond the first</strong> (7 pts with 2 traps, 8 pts with 3, etc.).</li>
        <li><strong>⚡ Match Blitz:</strong> One shared team clock for the whole match (5–15 min). The clock ticks only during guessing, and every Attempt 1 solve adds <strong>+30 seconds</strong>. When time expires, correctly placed cards on the board still score.</li>
        <li><strong>❤️ Marathon:</strong> Endless clovers with <strong>3 lives</strong>. Scoring fewer than 3 points on a clover costs 1 life. Play until out of lives or finish voluntarily anytime.</li>
      </ul>

      <h4 class="rules-heading">5. Decks & Non-Repeating Words</h4>
      <p>Mix multiple decks and word lists freely. Used cards and words are remembered per deck, and duplicate words across different decks are skipped automatically during a match.</p>
    `;
  }
}

export function handleNextRoundOrFinish(onNextRound, onGameOver) {
  const round = state.activeRound;
  if (!round) return;

  sounds.tap();
  haptics.tap();

  recordActiveRoundToHistory();

  if (round.gameMode === "marathon") {
    if (state.marathonLives > 0) {
      if (typeof onNextRound === "function") onNextRound(state.currentRoundIndex + 1);
    } else {
      sounds.fanfare();
      haptics.fanfare();
      saveState();
      if (typeof onGameOver === "function") onGameOver();
    }
    return;
  }

  const nextIndex = state.currentRoundIndex + 1;
  if (nextIndex < round.totalRounds) {
    if (typeof onNextRound === "function") onNextRound(nextIndex);
  } else {
    sounds.fanfare();
    haptics.fanfare();
    saveState();
    if (typeof onGameOver === "function") onGameOver();
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
