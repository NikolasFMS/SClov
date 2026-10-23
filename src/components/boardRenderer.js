/**
 * Clover Board Component Renderer
 * Generates the 4-leaf outer leaves and the 2x2 grid of cards.
 */
import { getBoardEdgePairs } from "../gameLogic.js";
import { renderCardHtml, escapeHtml } from "./cardRenderer.js";
import { I18N } from "../i18n.js";

export function renderCloverBoard(container, options = {}, state = {}) {
  if (!container) return;
  const {
    slots = [null, null, null, null],
    clues = { north: "", east: "", south: "", west: "" },
    showWordPreviews = false,
    canInteract = false,
    isLeaderMode = false
  } = options;

  const lang = state.lang || "ru";
  const t = I18N[lang] || I18N.ru;
  const pairs = showWordPreviews ? getBoardEdgePairs(slots, lang) : null;

  const previewN = pairs ? `${pairs.north[0]} + ${pairs.north[1]}` : "";
  const previewE = pairs ? `${pairs.east[0]} + ${pairs.east[1]}` : "";
  const previewS = pairs ? `${pairs.south[0]} + ${pairs.south[1]}` : "";
  const previewW = pairs ? `${pairs.west[0]} + ${pairs.west[1]}` : "";

  let gridCardsHtml = "";
  for (let i = 0; i < 4; i++) {
    const item = slots[i];
    if (item && item.card) {
      const locked = Boolean(item.isLocked);
      gridCardsHtml += renderCardHtml(
        item.card,
        item.rotation,
        {
          isLocked: locked,
          canRotate: canInteract && !locked,
          slotIndex: i,
          isDraggable: canInteract && !locked && !isLeaderMode
        },
        lang
      );
    } else {
      // Empty slot (serves as drop target and click target)
      gridCardsHtml += `
        <div class="card-slot-empty" data-action="empty-slot" data-slot-index="${i}">
          <div class="slot-idx-circle">${i + 1}</div>
          <div class="slot-empty-label">${t.tapToPlace}</div>
        </div>
      `;
    }
  }

  container.innerHTML = `
    <!-- Top Leaf: North Clue -->
    <div class="leaf-top" data-edge="north">
      <span class="leaf-tag">⬆️ ${t.leafNorthTag}</span>
      <div class="leaf-clue-text">${escapeHtml(clues.north) || "— — —"}</div>
      ${showWordPreviews ? `<div class="leaf-pair-preview">${escapeHtml(previewN)}</div>` : ""}
    </div>

    <!-- Middle Row: West Leaf, 2x2 Grid, East Leaf -->
    <div class="leaf-middle-row">
      <!-- West Leaf -->
      <div class="leaf-side" data-edge="west">
        <div class="leaf-side-inner-left">
          <span class="leaf-tag">⬅️ ${t.leafWestTag}</span>
          <span class="leaf-clue-text">${escapeHtml(clues.west) || "— — —"}</span>
        </div>
      </div>

      <!-- 2x2 Cards Grid -->
      <div class="clover-grid-2x2">
        ${gridCardsHtml}
      </div>

      <!-- East Leaf -->
      <div class="leaf-side" data-edge="east">
        <div class="leaf-side-inner-right">
          <span class="leaf-tag">➡️ ${t.leafEastTag}</span>
          <span class="leaf-clue-text">${escapeHtml(clues.east) || "— — —"}</span>
        </div>
      </div>
    </div>

    <!-- Bottom Leaf: South Clue -->
    <div class="leaf-bottom" data-edge="south">
      <span class="leaf-tag">⬇️ ${t.leafSouthTag}</span>
      <div class="leaf-clue-text">${escapeHtml(clues.south) || "— — —"}</div>
      ${showWordPreviews ? `<div class="leaf-pair-preview">${escapeHtml(previewS)}</div>` : ""}
    </div>
  `;
}
