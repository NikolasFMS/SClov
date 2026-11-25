/**
 * Touch and Pointer Drag-and-Drop Controller for Mobile & Desktop
 * Supports dragging cards between tray and clover slots, swapping cards,
 * and dragging board cards back to the tray.
 */
import { sounds } from "./audio.js";
import { haptics } from "./haptics.js";

export function initDragAndDrop(options = {}) {
  const {
    getRound,
    onStateChange,
    onCardClick,
    onRotateClick,
    onDragStart
  } = options;

  let dragContext = null;
  let suppressClickUntil = 0;
  const DRAG_THRESHOLD_MOUSE = 6;
  const DRAG_THRESHOLD_TOUCH = 10;
  const TOUCH_DRAG_OFFSET_Y = 26; // lifts dragged card slightly above fingertip for visibility
  const SLOT_HIT_MARGIN = 10; // forgiving margin so drops on 6px slot gaps snap cleanly
  const TRAY_HIT_MARGIN = 8;

  function onTeamScreenClickCapture(e) {
    if (Date.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onTouchMoveGuard(e) {
    if (dragContext && dragContext.isDragging && e.cancelable) {
      e.preventDefault();
    }
  }

  function attachWindowListeners() {
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMoveGuard, { passive: false });
  }

  function detachWindowListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("touchmove", onTouchMoveGuard);
  }

  function onPointerDown(e) {
    // A brand-new pointer gesture clears any stale click suppression from a previous gesture
    suppressClickUntil = 0;

    // Only primary mouse button or touch, and ignore secondary touches during active drag
    if (dragContext) return;
    if (e.button !== undefined && e.button !== 0) return;

    const cardEl = e.target.closest(".game-card:not(.locked)");
    if (!cardEl) return;

    const startedOnRotateBtn = Boolean(e.target.closest('[data-action="rotate"]'));
    const cardId = cardEl.getAttribute("data-card-id");
    const slotIdxStr = cardEl.getAttribute("data-slot-index");
    const inTray = cardEl.getAttribute("data-in-tray") === "true";
    const slotIndex = slotIdxStr !== null ? parseInt(slotIdxStr, 10) : null;
    const isTouch = e.pointerType === "touch";

    dragContext = {
      pointerId: e.pointerId,
      isTouch,
      threshold: isTouch ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE,
      offsetY: isTouch ? TOUCH_DRAG_OFFSET_Y : 0,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      cardEl,
      cardId,
      slotIndex,
      inTray,
      startedOnRotateBtn,
      isDragging: false,
      avatar: null,
      currentDropTarget: null
    };

    attachWindowListeners();
  }

  function onPointerMove(e) {
    if (!dragContext || dragContext.pointerId !== e.pointerId) return;

    dragContext.currentX = e.clientX;
    dragContext.currentY = e.clientY;

    const dx = e.clientX - dragContext.startX;
    const dy = e.clientY - dragContext.startY;
    const dist = Math.hypot(dx, dy);

    if (!dragContext.isDragging && dist >= dragContext.threshold) {
      dragContext.isDragging = true;

      if (typeof onDragStart === "function") {
        onDragStart();
      }

      // Prevent mobile page scroll while dragging
      if (e.cancelable) e.preventDefault();

      // Create floating drag avatar ghost
      const avatar = dragContext.cardEl.cloneNode(true);
      avatar.classList.add("drag-avatar");
      avatar.classList.remove("selected", "just-rotated");
      // Remove rotate button from avatar clone
      const rot = avatar.querySelector('[data-action="rotate"]');
      if (rot) rot.remove();

      document.body.appendChild(avatar);
      dragContext.avatar = avatar;

      dragContext.cardEl.classList.add("is-dragging");
      sounds.tap();
      haptics.dragStart();
    }

    if (dragContext.isDragging) {
      if (e.cancelable) e.preventDefault();

      const visualX = e.clientX;
      const visualY = e.clientY - dragContext.offsetY;

      if (dragContext.avatar) {
        dragContext.avatar.style.left = `${visualX}px`;
        dragContext.avatar.style.top = `${visualY}px`;
      }

      updateDropHover(visualX, visualY);
    }
  }

  function findBestDropTarget(x, y, ctx) {
    const boardContainer = document.getElementById("boardContainerTeam");
    if (boardContainer) {
      const candidates = [];

      boardContainer.querySelectorAll('.card-slot-empty[data-action="empty-slot"]').forEach((el) => {
        candidates.push({ type: "empty-slot", el });
      });

      boardContainer.querySelectorAll('.clover-grid-2x2 .game-card:not(.locked)').forEach((el) => {
        if (el !== ctx.cardEl) {
          candidates.push({ type: "board-card", el });
        }
      });

      let bestCandidate = null;
      let bestDistSq = Infinity;

      for (const cand of candidates) {
        const rect = cand.el.getBoundingClientRect();
        if (
          x >= rect.left - SLOT_HIT_MARGIN &&
          x <= rect.right + SLOT_HIT_MARGIN &&
          y >= rect.top - SLOT_HIT_MARGIN &&
          y <= rect.bottom + SLOT_HIT_MARGIN
        ) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestCandidate = cand;
          }
        }
      }

      if (bestCandidate) return bestCandidate;
    }

    // Check tray (if dragging from board back to tray)
    if (!ctx.inTray) {
      const trayBox = document.querySelector("#screenTeamGuessing .tray-box");
      if (trayBox) {
        const rect = trayBox.getBoundingClientRect();
        if (
          x >= rect.left - TRAY_HIT_MARGIN &&
          x <= rect.right + TRAY_HIT_MARGIN &&
          y >= rect.top - TRAY_HIT_MARGIN &&
          y <= rect.bottom + TRAY_HIT_MARGIN
        ) {
          return { type: "tray", el: trayBox };
        }
      }
    }

    return null;
  }

  function updateDropHover(visualX, visualY) {
    clearDropHover();
    if (!dragContext) return;

    const prevTargetEl = dragContext.currentDropTarget?.el || null;
    const nextTarget = findBestDropTarget(visualX, visualY, dragContext);

    if (nextTarget) {
      nextTarget.el.classList.add("drag-target-hover");
      dragContext.currentDropTarget = nextTarget;
      if (prevTargetEl !== nextTarget.el) haptics.dragHover();
      return;
    }

    dragContext.currentDropTarget = null;
  }

  function clearDropHover() {
    document.querySelectorAll(".drag-target-hover").forEach((el) => {
      el.classList.remove("drag-target-hover");
    });
  }

  function onPointerUp(e) {
    if (!dragContext || dragContext.pointerId !== e.pointerId) return;

    detachWindowListeners();

    if (dragContext.isDragging) {
      // Re-evaluate final release coordinates so fast mobile drags always land accurately
      const visualX = e.clientX;
      const visualY = e.clientY - dragContext.offsetY;
      updateDropHover(visualX, visualY);
    }

    clearDropHover();

    if (dragContext.avatar) {
      dragContext.avatar.remove();
      dragContext.avatar = null;
    }
    if (dragContext.cardEl) {
      dragContext.cardEl.classList.remove("is-dragging");
    }

    if (dragContext.isDragging) {
      // Suppress any trailing synthetic click (e.g. when drag began on center rotate button)
      suppressClickUntil = Date.now() + 400;
      // Execute drop action
      handleDropExecution(dragContext);
      dragContext = null;
    } else {
      // Tap without dragging: rotate immediately if started on center rotate button, else normal card tap
      const targetCardEl = dragContext.cardEl;
      const targetCardId = dragContext.cardId;
      const startedOnRotateBtn = dragContext.startedOnRotateBtn;
      dragContext = null;
      if (startedOnRotateBtn) {
        suppressClickUntil = Date.now() + 400;
        if (typeof onRotateClick === "function") {
          onRotateClick(targetCardId);
        }
      } else if (typeof onCardClick === "function") {
        onCardClick(targetCardEl, targetCardId);
      }
    }
  }

  function onPointerCancel(e) {
    if (!dragContext || dragContext.pointerId !== e.pointerId) return;

    detachWindowListeners();
    clearDropHover();

    if (dragContext.avatar) {
      dragContext.avatar.remove();
    }
    if (dragContext.cardEl) {
      dragContext.cardEl.classList.remove("is-dragging");
    }
    dragContext = null;
  }

  function handleDropExecution(ctx) {
    const round = typeof getRound === "function" ? getRound() : null;
    if (!round || !ctx.currentDropTarget) return;

    const { type, el } = ctx.currentDropTarget;

    // CASE 1: Dropped onto empty clover slot
    if (type === "empty-slot") {
      const targetSlotIdx = parseInt(el.getAttribute("data-slot-index"), 10);
      if (isNaN(targetSlotIdx)) return;

      if (ctx.inTray) {
        // Dragged from tray into empty slot
        const trayIdx = round.trayCards.findIndex((tc) => tc.card.id === ctx.cardId);
        if (trayIdx !== -1) {
          const [removed] = round.trayCards.splice(trayIdx, 1);
          round.teamBoard[targetSlotIdx] = {
            card: removed.card,
            rotation: removed.rotation,
            isLocked: false
          };
          round.selectedTrayCardId = null;
          sounds.place();
          haptics.place();
          onStateChange();
        }
      } else if (ctx.slotIndex !== null) {
        // Dragged from one board slot into another empty board slot
        const sourceItem = round.teamBoard[ctx.slotIndex];
        if (sourceItem && !sourceItem.isLocked) {
          round.teamBoard[targetSlotIdx] = sourceItem;
          round.teamBoard[ctx.slotIndex] = null;
          sounds.place();
          haptics.place();
          onStateChange();
        }
      }
      return;
    }

    // CASE 2: Dropped onto an occupied (unlocked) clover slot -> SWAP or REPLACE
    if (type === "board-card") {
      const targetSlotIdx = parseInt(el.getAttribute("data-slot-index"), 10);
      if (isNaN(targetSlotIdx) || targetSlotIdx === ctx.slotIndex) return;

      const targetItem = round.teamBoard[targetSlotIdx];
      if (!targetItem || targetItem.isLocked) return;

      if (ctx.inTray) {
        // Dragged from tray onto occupied slot: swap tray card with slot card
        const trayIdx = round.trayCards.findIndex((tc) => tc.card.id === ctx.cardId);
        if (trayIdx !== -1) {
          const [draggedTrayCard] = round.trayCards.splice(trayIdx, 1);
          // Return existing card to tray
          round.trayCards.push({
            card: targetItem.card,
            rotation: targetItem.rotation
          });
          // Place dragged card into slot
          round.teamBoard[targetSlotIdx] = {
            card: draggedTrayCard.card,
            rotation: draggedTrayCard.rotation,
            isLocked: false
          };
          round.selectedTrayCardId = null;
          sounds.place();
          haptics.place();
          onStateChange();
        }
      } else if (ctx.slotIndex !== null) {
        // Dragged from board slot onto another board slot: swap the two slots!
        const sourceItem = round.teamBoard[ctx.slotIndex];
        if (sourceItem && !sourceItem.isLocked) {
          round.teamBoard[targetSlotIdx] = sourceItem;
          round.teamBoard[ctx.slotIndex] = targetItem;
          sounds.place();
          haptics.place();
          onStateChange();
        }
      }
      return;
    }

    // CASE 3: Dragged from board slot back into tray
    if (type === "tray" && !ctx.inTray && ctx.slotIndex !== null) {
      const item = round.teamBoard[ctx.slotIndex];
      if (item && !item.isLocked) {
        round.trayCards.push({ card: item.card, rotation: item.rotation });
        round.teamBoard[ctx.slotIndex] = null;
        round.selectedTrayCardId = null;
        sounds.place();
        haptics.place();
        onStateChange();
      }
    }
  }

  // Attach listener to guessing screen container
  const teamScreen = document.getElementById("screenTeamGuessing");
  if (teamScreen) {
    teamScreen.addEventListener("pointerdown", onPointerDown);
    teamScreen.addEventListener("click", onTeamScreenClickCapture, true);
  }

  return {
    destroy() {
      if (teamScreen) {
        teamScreen.removeEventListener("pointerdown", onPointerDown);
        teamScreen.removeEventListener("click", onTeamScreenClickCapture, true);
      }
    }
  };
}
