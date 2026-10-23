/**
 * Card Component Renderer
 * Generates HTML string for 4-sided square cards with rotations, lock states, and word edges.
 */
import { getCardWordAt } from "../gameLogic.js";

export function getRotateSvg() {
  return `<svg viewBox="0 0 24 24"><path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.56-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.9-1.6-1.01-2.47zm1.02 5.36l1.42-1.42c.75.46 1.6.87 2.47 1.01v2.02c-1.39-.17-2.73-.72-3.89-1.61zm10.87-8.89l1.42-1.42C18.49 6.8 17.15 6.24 15.76 6.07v2.02c.87.14 1.72.55 2.22 1.02zm-2.02 9.07l1.42 1.42c1.16-.9 2.01-2.24 2.18-3.63h-2.02c-.14.87-.56 1.72-1.58 2.21zm2.2-6.54h2.02c-.17-1.39-.73-2.73-1.63-3.89l-1.41 1.42c.46.75.88 1.6 1.02 2.47zM13 4.07V1L8.45 5.55 13 10V6.09c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C20.54 15.01 21 13.57 21 12c0-4.42-3.58-8-8-7.93z"/></svg>`;
}

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderCardHtml(card, rotation = 0, options = {}, lang = "ru") {
  if (!card) return "";
  const {
    isLocked = false,
    isSelected = false,
    canRotate = true,
    slotIndex = null,
    inTray = false,
    isDraggable = true
  } = options;

  const wNorth = getCardWordAt(card, 0, rotation, lang);
  const wEast = getCardWordAt(card, 1, rotation, lang);
  const wSouth = getCardWordAt(card, 2, rotation, lang);
  const wWest = getCardWordAt(card, 3, rotation, lang);

  const classes = ["game-card"];
  if (isLocked) classes.push("locked");
  if (isSelected) classes.push("selected");
  if (isDraggable && !isLocked) classes.push("draggable-card");

  const dataAttrs = [
    `data-card-id="${escapeHtml(card.id)}"`,
    `data-rotation="${rotation}"`
  ];
  if (slotIndex !== null) dataAttrs.push(`data-slot-index="${slotIndex}"`);
  if (inTray) dataAttrs.push(`data-in-tray="true"`);

  return `
    <div class="${classes.join(" ")}" ${dataAttrs.join(" ")}>
      <!-- North word -->
      <div class="card-word-north" title="${escapeHtml(wNorth)}">${escapeHtml(wNorth)}</div>

      <!-- Middle row: West word, Center rotate button, East word -->
      <div class="card-middle-row">
        <div class="card-word-west-box">
          <div class="card-word-west" title="${escapeHtml(wWest)}">${escapeHtml(wWest)}</div>
        </div>

        ${
          canRotate && !isLocked
            ? `<button type="button" class="btn-card-rotate" data-action="rotate" data-card-id="${escapeHtml(card.id)}" title="⟳">
                ${getRotateSvg()}
              </button>`
            : `<div style="width:26px; height:26px; align-self:center; flex-shrink:0;"></div>`
        }

        <div class="card-word-east-box">
          <div class="card-word-east" title="${escapeHtml(wEast)}">${escapeHtml(wEast)}</div>
        </div>
      </div>

      <!-- South word -->
      <div class="card-word-south" title="${escapeHtml(wSouth)}">${escapeHtml(wSouth)}</div>

      ${isLocked ? `<div class="card-locked-icon" title="✓">✓</div>` : ""}
    </div>
  `;
}
