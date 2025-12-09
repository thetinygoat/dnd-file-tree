import { File, Folder } from "lucide-react";
import type { TTreeNode } from "../../types";

// =============================================================================
// GHOST NODE
// =============================================================================
//
// This component renders a lightweight preview of an item being dragged.
// It's shown inside dnd-kit's DragOverlay, which follows the cursor.
//
// Features:
//   - Shows item icon and name
//   - Optionally shows count badge when dragging multiple items
//   - Semi-transparent to indicate it's a "ghost"
//
// The DragOverlay is rendered in a portal, so it's not affected by
// the tree's scroll position or z-index.
//
// =============================================================================

interface GhostNodeProps {
  /** The primary item being dragged (first in selection) */
  node: TTreeNode;

  /**
   * Total number of items being dragged.
   * If > 1, shows a count badge.
   */
  count?: number;
}

export function GhostNode({ node, count = 1 }: GhostNodeProps) {
  const isDirectory = node.type === "directory";
  const Icon = isDirectory ? Folder : File;

  return (
    <div className="relative">
      {/* Main ghost item - highly transparent so drop lines remain visible */}
      <div
        className={`
          flex items-center gap-2 py-1 px-3
          bg-slate-800/30 border border-slate-500 rounded-md
          shadow-lg
        `}
      >
        <Icon
          size={16}
          className={isDirectory ? "text-amber-400" : "text-slate-400"}
        />
        <span className="text-slate-200 text-sm">{node.name}</span>
      </div>

      {/* Count badge for multi-drag */}
      {count > 1 && (
        <span
          className={`
            absolute -top-2 -right-2
            min-w-[20px] h-5
            flex items-center justify-center
            bg-blue-500 text-white text-xs font-medium
            rounded-full px-1.5
          `}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// WHY A SEPARATE COMPONENT?
// =============================================================================
//
// Q: Why not reuse TreeNode for the drag preview?
//
// A: Several reasons:
//
//   1. DIFFERENT STYLING: The ghost needs different visuals:
//      - Shadow for floating effect
//      - No indent (always starts at left)
//      - Count badge for multi-drag
//
//   2. NO INTERACTION: The ghost doesn't need:
//      - Click handlers
//      - Droppable registration
//      - Selection state
//      - Collapse chevron
//
//   3. PERFORMANCE: Simpler component = faster renders during drag
//
//   4. PORTAL CONTEXT: DragOverlay renders in a portal, so store
//      subscriptions and context may behave differently
//
// =============================================================================
