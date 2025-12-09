import { useDroppable } from "@dnd-kit/core";

// =============================================================================
// CATCH ZONE
// =============================================================================
//
// Invisible droppable areas at the start and end of the tree list.
// These make it easier to drop items at the very beginning or end,
// which would otherwise require precise mouse positioning.
//
// The zones have a small height (20px) and are invisible but droppable.
// When the user drags over them, we treat it as dropping at position 0
// (for start) or at the end of the list.
//
// =============================================================================

interface CatchZoneProps {
  /** Unique ID for this catch zone */
  id: string;

  /** Position: "start" or "end" of the list */
  position: "start" | "end";
}

export function CatchZone({ id, position }: CatchZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: "catch-zone",
      position,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        h-5 w-full
        ${isOver ? "bg-blue-500/20" : ""}
        transition-colors
      `}
    />
  );
}
