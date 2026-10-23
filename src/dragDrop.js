/**
 * Touch and Pointer Drag-and-Drop Controller for Mobile & Desktop
 * Supports dragging cards between tray and clover slots, swapping cards,
 * and dragging board cards back to the tray.
 */
import { sounds } from "./audio.js";

export function initDragAndDrop(options = {}) {
  const {
    getRound,
    onStateChange,
    onCardClick
  } = options;

  let dragContext = null;
  const DRAG_THRESHOLD = 7; // pixels before tap becomes drag

  function onPointerDown(e) {
    // Only primary mouse button or touch
    if (e.button !== undefined && e.button !== 0) return;

    // Do not initiate drag from rotate button
    if (e.target.closest('[data-action="rotate"]')) return;

    const cardEl = e.target.closest(".game-card:not(.locked)");
    if (!cardEl) return;

    const cardId = cardEl.getAttribute("data-card-id");
    const slotIdxStr = cardEl.getAttribute("data-slot-index");
    const inTray = cardEl.getAttribute("data-in-tray") === "true";
    const slotIndex = slotIdxStr !== null ? parseInt(slotIdxStr, 10) : null;

    dragContext = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      cardEl,
      cardId,
      slotIndex,
      inTray,
      isDragging: false,
      avatar: null,
      currentDropTarget: null
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  function onPointerMove(e) {
    if (!dragContext || dragContext.pointerId !== e.pointerId) return;

    dragContext.currentX = e.clientX;
    dragContext.currentY = e.clientY;

    const dx = e.clientX - dragContext.startX;
    const dy = e.clientY - dragContext.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!dragContext.isDragging && dist >= DRAG_THRESHOLD) {
      dragContext.isDragging = true;

      // Prevent mobile page scroll while dragging
      if (e.cancelable) e.preventDefault();

      // Create floating drag avatar ghost
      const avatar = dragContext.cardEl.cloneNode(true);
      avatar.classList.add("drag-avatar");
      avatar.classList.remove("selected");
      // Remove rotate button from avatar clone
      const rot = avatar.querySelector('[data-action="rotate"]');
      if (rot) rot.remove();

      document.body.appendChild(avatar);
      dragContext.avatar = avatar;

      dragContext.cardEl.classList.add("is-dragging");
      sounds.tap();
    }

    if (dragContext.isDragging) {
      if (e.cancelable) e.preventDefault();

      if (dragContext.avatar) {
        dragContext.avatar.style.left = `${e.clientX}px`;
        dragContext.avatar.style.top = `${e.clientY}px`;
      }

      updateDropHover(e.clientX, e.clientY);
    }
  }

  function updateDropHover(clientX, clientY) {
    clearDropHover();

    // Temporarily hide avatar to get element beneath
    if (dragContext?.avatar) dragContext.avatar.style.display = "none";
    const elemBelow = document.elementFromPoint(clientX, clientY);
    if (dragContext?.avatar) dragContext.avatar.style.display = "";

    if (!elemBelow) return;

    // Check empty slot
    const emptySlot = elemBelow.closest('.card-slot-empty[data-action="empty-slot"]');
    if (emptySlot) {
      emptySlot.classList.add("drag-target-hover");
      dragContext.currentDropTarget = { type: "empty-slot", el: emptySlot };
      return;
    }

    // Check occupied slot (swap target)
    const boardCard = elemBelow.closest('.clover-grid-2x2 .game-card:not(.locked)');
    if (boardCard && boardCard !== dragContext.cardEl) {
      boardCard.classList.add("drag-target-hover");
      dragContext.currentDropTarget = { type: "board-card", el: boardCard };
      return;
    }

    // Check tray (if dragging from board)
    if (!dragContext.inTray) {
      const trayBox = elemBelow.closest(".tray-box");
      if (trayBox) {
        trayBox.classList.add("drag-target-hover");
        dragContext.currentDropTarget = { type: "tray", el: trayBox };
        return;
      }
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

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);

    clearDropHover();

    if (dragContext.avatar) {
      dragContext.avatar.remove();
      dragContext.avatar = null;
    }
    if (dragContext.cardEl) {
      dragContext.cardEl.classList.remove("is-dragging");
    }

    if (dragContext.isDragging) {
      // Execute drop action
      handleDropExecution(dragContext);
      dragContext = null;
    } else {
      // Tap without dragging: trigger normal click/tap handler
      const targetCardEl = dragContext.cardEl;
      const targetCardId = dragContext.cardId;
      dragContext = null;
      if (typeof onCardClick === "function") {
        onCardClick(targetCardEl, targetCardId);
      }
    }
  }

  function onPointerCancel(e) {
    if (!dragContext || dragContext.pointerId !== e.pointerId) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);

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
          onStateChange();
        }
      } else if (ctx.slotIndex !== null) {
        // Dragged from one board slot into another empty board slot
        const sourceItem = round.teamBoard[ctx.slotIndex];
        if (sourceItem && !sourceItem.isLocked) {
          round.teamBoard[targetSlotIdx] = sourceItem;
          round.teamBoard[ctx.slotIndex] = null;
          sounds.place();
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
          onStateChange();
        }
      } else if (ctx.slotIndex !== null) {
        // Dragged from board slot onto another board slot: swap the two slots!
        const sourceItem = round.teamBoard[ctx.slotIndex];
        if (sourceItem && !sourceItem.isLocked) {
          round.teamBoard[targetSlotIdx] = sourceItem;
          round.teamBoard[ctx.slotIndex] = targetItem;
          sounds.place();
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
        onStateChange();
      }
    }
  }

  // Attach listener to guessing screen container
  const teamScreen = document.getElementById("screenTeamGuessing");
  if (teamScreen) {
    teamScreen.addEventListener("pointerdown", onPointerDown);
  }

  return {
    destroy() {
      if (teamScreen) {
        teamScreen.removeEventListener("pointerdown", onPointerDown);
      }
    }
  };
}
